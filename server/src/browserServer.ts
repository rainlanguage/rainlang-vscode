import { 
    Meta, 
    Range,
    Compile, 
    ErrorCode,
    keccak256,  
    RainDocument,
    HASH_PATTERN, 
    TextDocument, 
    RainLanguageServices,
    getRainLanguageServices 
} from "@rainprotocol/rainlang";
import {
    TextEdit, 
    TextDocuments,
    createConnection,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    BrowserMessageReader, 
    BrowserMessageWriter, 
    DidChangeConfigurationNotification 
} from "vscode-languageserver/browser";


/* browser specific setup code */
const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

/* from here on, all code is non-browser specific and could be shared with a regular extension */
// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// map of rain documents import hashs for the purpose of auto update the local import hashs
const hashMap: Map<string, { hash: string; range: Range }[]> = new Map();

const metaStore = new Meta.Store();
let langServices: RainLanguageServices;

let hasWorkspaceFolderCapability = false;
let clientCapabilities;
let workspaceRootUri: string | null;

connection.onInitialize(async(params: InitializeParams) => {
    workspaceRootUri = params.rootUri !== null 
        ? params.rootUri 
        : params.workspaceFolders && params.workspaceFolders.length > 0 
            ? params.workspaceFolders[0].uri 
            : null;
    clientCapabilities = params.capabilities;
    hasWorkspaceFolderCapability = !!(
        clientCapabilities.workspace && !!clientCapabilities.workspace.workspaceFolders
    );

    langServices = getRainLanguageServices({
        clientCapabilities,
        metaStore,
        noMetaSearch: true
    });

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                completionItem: {
                    labelDetailsSupport: true
                },
                triggerCharacters: [".", "'", "/"]
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
    // send notif to client to get config
    connection.sendNotification("request-config", workspaceRootUri);
});

// update meta store when config has changed and revalidate documents
connection.onNotification("update-meta-store", async e => {
    try {
        for (const d of e[1]) metaStore.update(keccak256(d), d);
        for (let i = 0; i < e[2].length; i++) metaStore.update(e[2][i][0], e[2][i][1]);
        metaStore.addSubgraphs(e[0]);
        // documents.all().forEach(v => validate(v, v.getText(), v.version));
    }
    catch { /**/ }
});

connection.onNotification("watch-dotrain", async e => {
    metaStore.storeDotrain(e[1], e[0]);
    setHashMap(e[1], e[0]);
});

connection.onNotification("unwatch-all", () => {
    hashMap.clear();
    Object.keys(metaStore.dotrainCache).forEach(v => {
        metaStore.deleteDotrain(v);
    });
});

connection.onNotification("reval-all", () => {
    documents.all().forEach(v => validate(v, v.getText(), v.version));
});

// executes rain compile command
connection.onExecuteCommand(async e => {
    if (e.command === "_compile") {
        const langId = e.arguments![0];
        const uriOrFile = e.arguments![1];
        const expKeys = JSON.parse(e.arguments![2]);
        const isUri = e.arguments![3] === "uri";
        if (langId === "rainlang") {
            let _td;
            if (isUri) _td = documents.get(uriOrFile);
            else _td = uriOrFile;
            if (_td) {
                try {
                    return await Compile.RainDocument(_td, expKeys, {metaStore});
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

documents.onDidOpen(v => {
    const text = v.document.getText();
    validate(v.document, text, v.document.version);
});

documents.onDidClose(v => {
    connection.sendDiagnostics({ uri: v.document.uri, diagnostics: []});
});

documents.onDidChangeContent(change => {
    validate(change.document, change.document.getText(), change.document.version);
});

documents.onDidSave(e => {
    if (e.document.languageId === "rainlang" && hashMap.has(e.document.uri)) {
        setHashMap(e.document.getText(), e.document.uri);
        metaStore.storeDotrain(
            e.document.getText(), e.document.uri
        ).then(({ newHash, oldHash }) => {
            if (oldHash !== undefined) {
                const changes: { [uri: string]: TextEdit[] } = {};
                hashMap.forEach((imports, uri) => {
                    if (uri !== e.document.uri) {
                        const imp = imports.find(
                            e => e.hash.toLowerCase() === oldHash.toLowerCase()
                        );
                        if (imp ) changes[uri] = [{ range: imp.range, newText: newHash }];
                    }
                });
                if (Object.keys(changes).length > 0) connection.workspace.applyEdit(
                    { changes }
                ).then(
                    () => {
                        for (const uri in changes) {
                            const doc = documents.get(uri);
                            if (doc !== undefined) {
                                const doc = documents.get(uri);
                                if (doc !== undefined) setHashMap(doc.getText(), uri);
                            }
                        }
                    },
                    () => {
                        for (const uri in changes) {
                            const doc = documents.get(uri);
                            if (doc !== undefined) setHashMap(doc.getText(), uri);
                        }
                    }
                );
            }
        });
    }
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
connection.languages.semanticTokens.on(async e => {
    let data: number[];
    const _td = documents.get(e.textDocument.uri);
    if (_td && _td.languageId === "rainlang") {
        const _rd = new RainDocument(_td, metaStore);
        (_rd as any)._shouldSearch = false;
        await _rd.parse();
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
                            )
                        ));
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
async function validate(textDocument: TextDocument, text: string, version: number) {
    if (textDocument.languageId === "rainlang") {
        const td = TextDocument.create(textDocument.uri, "rainlang", 0, text);
        langServices.doValidate(td).then(
            diagnostics => {
                if (version === textDocument.version) {
                    connection.sendDiagnostics({ 
                        uri: textDocument.uri, 
                        diagnostics
                    });
                }
            },
            () => { /**/ }
        );
    }
}

async function setHashMap(text: string, uri: string) {
    const _td = TextDocument.create(uri, "rainlang", 0, text);
    const _rd = new RainDocument(_td, metaStore);
    (_rd as any)._shouldSearch = false;
    _rd.parse().then(
        () => hashMap.set(
            uri, 
            _rd.imports.filter(v => HASH_PATTERN.test(v.hash)).map(v => ({
                hash: v.hash.toLowerCase(), 
                range: Range.create(
                    _td.positionAt(v.hashPosition[0]),
                    _td.positionAt(v.hashPosition[1] + 1)
                ) 
            }))
        ),
        () => hashMap.set(uri, [])
    );   
}