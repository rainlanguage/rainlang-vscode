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
    ProposedFeatures,
    InitializeResult,
    TextDocumentSyncKind,
    SemanticTokensParams,
    DidChangeConfigurationNotification 
} from "vscode-languageserver/node";


// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let langServices: RainLanguageServices;
const metaStore = new MetaStore();
let hasWorkspaceFolderCapability = false;
let clientCapabilities;

connection.onInitialize(async(params) => {
    clientCapabilities = params.capabilities;
    console.log((clientCapabilities.textDocument));
    hasWorkspaceFolderCapability = !!(
        clientCapabilities.workspace && !!clientCapabilities.workspace.workspaceFolders
    );

    // add subgraphs to metaStore
    if (params.initializationOptions) {
        if (params.initializationOptions.localMetas) {
            for (const hash of Object.keys(params.initializationOptions.localMetas)) {
                metaStore.updateStore(hash, params.initializationOptions.localMetas[hash]);
            }
        }
        if (params.initializationOptions.subgraphs) metaStore.addSubgraphs(
            params.initializationOptions.subgraphs
        );
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
            },
            // inlayHintProvider: true,
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
        const expKeys = e.arguments![2];
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

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log("We received an file change event");
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

// connection.onRequest("getElissions", (async(e: string) => {
//     const textDoc = documents.get(e);
//     if (textDoc) {
//         const _d = new RainDocument(textDoc, metaStore);
//         await _d.parse();
//         const _elisions = _d.bindings.filter(
//             v => v.elided !== undefined
//         );
//         return _elisions.flatMap(v => {
//             const _start = textDoc.positionAt(v.contentPosition[0] + 1);
//             const _end = textDoc.positionAt(v.contentPosition[1] + 1);
//             if (_start.line === _end.line) return [Range.create(_start, _end)];
//             else {
//                 const _ranges = [];
//                 for (let i = 0; i <= _end.line - _start.line; i++) {
//                     console.log(i);
//                     if (i === 0) _ranges.push(
//                         Range.create(_start, textDoc.positionAt(
//                             (textDoc.offsetAt({line: _start.line + 1, character: 0}) - 1)
//                         ))
//                     );
//                     else if (i === _end.line - _start.line) _ranges.push(
//                         Range.create({line: _end.line, character: 0}, _end)
//                     );
//                     else {
//                         if (_start.line + i >= textDoc.lineCount) {
//                             const _pos = textDoc.positionAt(textDoc.getText().length - 1);
//                             _ranges.push(Range.create(
//                                 textDoc.lineCount - 1, 
//                                 0, 
//                                 _pos.line , 
//                                 _pos.character
//                             ));
//                         }
//                         else {
//                             const _pos = textDoc.positionAt(
//                                 textDoc.offsetAt({line: _start.line + i + 1, character: 0}) - 1
//                             );
//                             _ranges.push(Range.create(
//                                 _start.line + i, 
//                                 0, 
//                                 _pos.line, 
//                                 _pos.character
//                             ));
//                         }
//                     }
//                 }
//                 return _ranges;
//             }
//         });
//     }
//     else return [];
// }));

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
