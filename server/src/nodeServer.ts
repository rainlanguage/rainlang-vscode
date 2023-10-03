import { 
    Meta, 
    Range,
    Compile, 
    ErrorCode, 
    TextDocument, 
    RainLanguageServices,
    getRainLanguageServices, 
    RainDocument
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

const metaStore = new Meta.Store();
let langServices: RainLanguageServices;

let hasWorkspaceFolderCapability = false;
let clientCapabilities;

connection.onInitialize(async(params) => {
    clientCapabilities = params.capabilities;
    hasWorkspaceFolderCapability = !!(
        clientCapabilities.workspace && !!clientCapabilities.workspace.workspaceFolders
    );

    // add subgraphs to metaStore
    if (params.initializationOptions) {
        // console.log(params.initializationOptions);
        if (params.initializationOptions.meta) {
            for (const hash of Object.keys(params.initializationOptions.meta)) {
                await metaStore.update(hash, params.initializationOptions.meta[hash]);
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
                triggerCharacters: [".", "'"]
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
        console.log(langId, uri, expKeys);
        if (langId === "rainlang") {
            const _td = documents.get(uri);
            if (_td) {
                try {
                    return await Compile.RainDocument(_td, expKeys);
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

// connection.onDidChangeConfiguration(async() => {
//     const settings = await getSetting();
//     if (settings?.localMetas) {
//         for (const hash of Object.keys(settings.localMetas)) {
//             await metaStore.update(hash, settings.localMetas[hash]);
//         }
//     }
//     if (settings?.subgraphs) await metaStore.addSubgraphs(settings.subgraphs);
//     documents.all().forEach(async(v) => {
//         if (v.languageId === "rainlang") {
//             langServices.rainDocuments.delete(v.uri);
//             validate(v);
//         }
//     });
// });

connection.onNotification("change-rain-config", async e => {
    console.log(e);
    if (e?.meta) {
        for (const hash of Object.keys(e.meta)) {
            await metaStore.update(hash, e.meta[hash]);
        }
    }
    if (e?.subgraphs) await metaStore.addSubgraphs(e.subgraphs);
    documents.all().forEach(async(v) => {
        if (v.languageId === "rainlang") validate(v);
    });
});

documents.onDidOpen(v => {
    if (v.document.languageId === "rainlang") validate(v.document);
});

documents.onDidClose(v => {
    connection.sendDiagnostics({ uri: v.document.uri, diagnostics: []});
});

documents.onDidChangeContent(async(change) => {
    if (change.document.languageId === "rainlang") {
        if (change.document.languageId === "rainlang") validate(change.document);
    }
});

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log("We received an file change event");
});

connection.onCompletion(params => {
    const textDoc = documents.get(params.textDocument.uri);
    if (textDoc?.languageId === "rainlang") return langServices.doComplete(
        textDoc, 
        params.position
    );
    else return null;
});

connection.onCompletionResolve(item => item);

connection.onHover(params => {
    const textDoc = documents.get(params.textDocument.uri);
    if (textDoc?.languageId === "rainlang") return langServices.doHover(
        textDoc, 
        params.position
    );
    else return null;
});

// provide semantic token highlighting
connection.languages.semanticTokens.on(async(e: SemanticTokensParams) => {
    let data: number[];
    const _td = documents.get(e.textDocument.uri);
    if (_td) {
        const _rd = await RainDocument.create(_td, metaStore);
        let _lastLine = 0;
        let _lastChar = 0;
        data = _rd.bindings.filter(v => 
            v.elided !== undefined || (
                v.exp !== undefined && v.problems.find(
                    e => e.code === ErrorCode.ElidedBinding
                )
            )
        ).flatMap(v => {
            if (v.exp !== undefined) return v.problems.filter(
                e => e.code === ErrorCode.ElidedBinding
            ).map(e => Range.create(
                _rd.textDocument.positionAt(e.position[0]), 
                _rd.textDocument.positionAt(e.position[1] + 1)
            ));
            else {
                const _start = _rd.textDocument.positionAt(v.contentPosition[0] + 1);
                const _end = _rd.textDocument.positionAt(v.contentPosition[1] + 1);
                if (_start.line === _end.line) return [Range.create(_start, _end)];
                else {
                    const _ranges = [];
                    for (let i = 0; i <= _end.line - _start.line; i++) {
                        if (i === 0) _ranges.push(Range.create(
                            _start, 
                            _rd.textDocument.positionAt(
                                (_rd.textDocument.offsetAt(
                                    {line: _start.line + 1, character: 0}) - 1
                                )
                            ))
                        );
                        else if (i === _end.line - _start.line) _ranges.push(
                            Range.create({line: _end.line, character: 0}, _end)
                        );
                        else {
                            if (_start.line + i >= _rd.textDocument.lineCount) {
                                const _pos = _rd.textDocument.positionAt(
                                    _rd.getText().length - 1
                                );
                                _ranges.push(Range.create(
                                    _rd.textDocument.lineCount - 1, 
                                    0, 
                                    _pos.line , 
                                    _pos.character
                                ));
                            }
                            else {
                                const _pos = _rd.textDocument.positionAt(
                                    _rd.textDocument.offsetAt(
                                        {line: _start.line + i + 1, character: 0}
                                    ) - 1
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
            }
        }).sort((a, b) => a.start.line === b.start.line 
            ? a.start.character - b.start.character 
            : a.start.line - b.start.line
        ).flatMap(v => {
            const _lineDelta = v.start.line - _lastLine;
            const _result = [
                _lineDelta,
                _lineDelta === 0
                    ? v.start.character - _lastChar
                    : v.start.character,
                v.end.character - v.start.character,
                0,
                1
            ];
            _lastLine = v.start.line;
            _lastChar = v.start.character;
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
async function validate(textDocument: TextDocument): Promise<void> {
    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ 
        uri: textDocument.uri, 
        diagnostics: await langServices.doValidate(textDocument)
    });
}
