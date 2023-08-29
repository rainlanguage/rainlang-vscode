import { 
    Range,
    dotrainc,
    MetaStore, 
    TextDocument, 
    RainDocument, 
    RainLanguageServices,
    getRainLanguageServices 
} from "@rainprotocol/rainlang";
import {
    TextDocuments,
    createConnection,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    BrowserMessageReader, 
    BrowserMessageWriter,  
    SemanticTokensParams, 
    DidChangeConfigurationNotification 
} from "vscode-languageserver/browser";


/* browser specific setup code */
const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

/* from here on, all code is non-browser specific and could be shared with a regular extension */
// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let langServices: RainLanguageServices;
const metaStore = new MetaStore();
let hasWorkspaceFolderCapability = false;
let clientCapabilities;

connection.onInitialize(async(params: InitializeParams) => {
    clientCapabilities = params.capabilities;
    hasWorkspaceFolderCapability = !!(
        clientCapabilities.workspace && !!clientCapabilities.workspace.workspaceFolders
    );

    // add subgraphs to metaStore
    if (params.initializationOptions) {
        const settings = JSON.parse(params.initializationOptions);
        if (settings.localMetas) for (const hash of Object.keys(settings.localMetas)) {
            metaStore.updateStore(hash, settings.localMetas[hash]);
        }
        if (settings.subgraphs) metaStore.addSubgraphs(settings.subgraphs);
    }

    langServices = getRainLanguageServices({
        clientCapabilities,
        metaStore
    });

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                completionItem: {
                    labelDetailsSupport: true
                },
                triggerCharacters: ["."]
            },
            hoverProvider: true,
            executeCommandProvider: {
                commands: ["_compile"]
            },
            semanticTokensProvider: {
                legend: {
                    tokenTypes: ["keyword", "class", "interface", "enum", "function", "variable"],
                    tokenModifiers: ["declaration", "readonly"]
                },
                full: true
            }
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});

connection.onInitialized(() => {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log("Workspace folder change event received.");
        });
    }
});

// executes rain compile command
connection.onExecuteCommand(async e => {
    if (e.command === "_compile") {
        const langId = e.arguments![0];
        const uri = e.arguments![1];
        const expKeys = JSON.parse(e.arguments![2]);
        if (langId === "rainlang") {
            const _doc = documents.get(uri);
            if (_doc) {
                try {
                    return await dotrainc(_doc, expKeys, metaStore);
                }
                catch (err) {
                    return err;
                }
            }
            else return null;
        }
        else return null;
    }
});

connection.onDidChangeConfiguration(async() => {
    const settings = await getSetting();
    if (settings?.subgraphs) metaStore.addSubgraphs(settings.subgraphs);
    documents.all().forEach(v => {
        if (v.languageId === "rainlang") doValidate(v);
    });
});

documents.onDidOpen(v => {
    if (v.document.languageId === "rainlang") doValidate(v.document);
});

documents.onDidClose(v => {
    connection.sendDiagnostics({ uri: v.document.uri, diagnostics: []});
});

documents.onDidChangeContent(change => {
    if (change.document.languageId === "rainlang") doValidate(change.document);
});

connection.onCompletion(params => {
    const textDoc = documents.get(params.textDocument.uri);
    if (textDoc && textDoc.languageId === "rainlang") return langServices.doComplete(
        textDoc, 
        params.position
    );
    else return null;
});

connection.onCompletionResolve(item => item);

connection.onHover(params => {
    const textDoc = documents.get(params.textDocument.uri);
    if (textDoc && textDoc.languageId === "rainlang") return langServices.doHover(
        textDoc, 
        params.position
    );
    else return null;
});

connection.languages.semanticTokens.on(async(e: SemanticTokensParams) => {
    let data: number[];
    const _textDoc = documents.get(e.textDocument.uri);
    if (_textDoc) {
        const _d = new RainDocument(_textDoc, metaStore);
        await _d.parse();
        let _lastLine = 0;
        data = _d.bindings.filter(
            v => v.elided !== undefined
        ).flatMap(v => {
            const _start = _textDoc.positionAt(v.contentPosition[0] + 1);
            const _end = _textDoc.positionAt(v.contentPosition[1] + 1);
            if (_start.line === _end.line) return [Range.create(_start, _end)];
            else {
                const _ranges = [];
                for (let i = 0; i <= _end.line - _start.line; i++) {
                    console.log(i);
                    if (i === 0) _ranges.push(
                        Range.create(_start, _textDoc.positionAt(
                            (_textDoc.offsetAt({line: _start.line + 1, character: 0}) - 1)
                        ))
                    );
                    else if (i === _end.line - _start.line) _ranges.push(
                        Range.create({line: _end.line, character: 0}, _end)
                    );
                    else {
                        if (_start.line + i >= _textDoc.lineCount) {
                            const _pos = _textDoc.positionAt(_textDoc.getText().length - 1);
                            _ranges.push(Range.create(
                                _textDoc.lineCount - 1, 
                                0, 
                                _pos.line , 
                                _pos.character
                            ));
                        }
                        else {
                            const _pos = _textDoc.positionAt(
                                _textDoc.offsetAt({line: _start.line + i + 1, character: 0}) - 1
                            );
                            _ranges.push(Range.create(
                                _start.line + i, 
                                0, 
                                _pos.line, 
                                _pos.character
                            ));
                        }
                    }
                }
                return _ranges;
            }
        }).flatMap(v => {
            const _result = [
                v.start.line - _lastLine,
                v.start.character,
                v.end.character - v.start.character,
                0,
                1
            ];
            _lastLine = v.start.line;
            return _result;
        });
    }
    else data = [];
    return { data };
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

// gets the rainlang settings
async function getSetting() {
    return await connection.workspace.getConfiguration({
        section: "rainlang"
    });
}

// validate a document
async function doValidate(textDocument: TextDocument): Promise<void> {
    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ 
        uri: textDocument.uri, 
        diagnostics: await langServices.doValidation(textDocument)
    });
}