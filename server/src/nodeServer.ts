import { TextDocument } from "vscode-languageserver-textdocument";
import { 
    Range, 
    hexlify, 
    MetaStore, 
    MarkupKind,
    RainDocument,
    TextDocumentItem, 
    RainLanguageServices,
} from "@rainlanguage/dotrain";
import {
    TextEdit, 
    TextDocuments,
    createConnection,
    ProposedFeatures,
    InitializeResult,
    TextDocumentSyncKind, 
    DidChangeConfigurationNotification
} from "vscode-languageserver/node";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// map of rain documents import hashs for the purpose of auto update the local import hashs
const hashMap: Map<string, { hash: string; range: Range }[]> = new Map();

const metaStore = new MetaStore();
let langServices: RainLanguageServices;

let hasWorkspaceFolderCapability = false;
let clientCapabilities;
let workspaceRootUri: string | null;

connection.onInitialize(async(params) => {
    workspaceRootUri = params.rootUri !== null 
        ? params.rootUri 
        : params.workspaceFolders && params.workspaceFolders.length > 0 
            ? params.workspaceFolders[0].uri 
            : null;
    clientCapabilities = params.capabilities;
    hasWorkspaceFolderCapability = !!(
        clientCapabilities.workspace && !!clientCapabilities.workspace.workspaceFolders
    );

    // initiate the language services
    langServices = new RainLanguageServices(metaStore);

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
                commands: ["_compose"]
            },
            semanticTokensProvider: {
                legend: {
                    tokenTypes: ["keyword", "class"],
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
    // send notif to client to get config
    connection.sendNotification("request-config", workspaceRootUri);
});

// update meta store when config has changed and revalidate documents
connection.onNotification("update-meta-store", async e => {
    try {
        metaStore.addSubgraphs(e[0]);
        // documents.all().forEach(v => validate(v, v.getText(), v.version));
    }
    catch { /**/ }
});

connection.onNotification("watch-dotrain", async e => {
    metaStore.setDotrain(e[1], e[0], false);
    setHashMap(e[1], e[0]);
});

connection.onNotification("unwatch-all", () => {
    hashMap.clear();
    Object.keys(metaStore.dotrainCache).forEach(v => {
        metaStore.deleteDotrain(v, false);
    });
});

connection.onNotification("reval-all", () => {
    documents.all().forEach(v => validate(v.uri, v.getText(), v.version, v.languageId));
});

// executes rain compile command
connection.onExecuteCommand(async e => {
    if (e.command === "_compose") {
        const langId = e.arguments![0];
        const uri = e.arguments![1];
        const entrypoints = e.arguments![2];
        if (langId === "rainlang") {
            const _td = documents.get(uri)?.getText();
            if (_td) {
                try {
                    return [await RainDocument.composeTextAsync(_td, entrypoints, metaStore), true];
                } catch(e) {
                    return [e, false];
                }
            }
            else return [undefined, false];
        }
        else return [undefined, false];
    }
});

documents.onDidOpen(async v => {
    validate(
        v.document.uri,
        v.document.getText(),
        v.document.version, 
        v.document.languageId
    );
});

documents.onDidClose(v => {
    connection.sendDiagnostics({ uri: v.document.uri, diagnostics: []});
});

documents.onDidChangeContent(change => {
    validate(
        change.document.uri, 
        change.document.getText(), 
        change.document.version, 
        change.document.languageId
    );
});

documents.onDidSave(e => {
    if (e.document.languageId === "rainlang" && hashMap.has(e.document.uri)) {
        setHashMap(e.document.getText(), e.document.uri);
        const [ h1, h2 ] = metaStore.setDotrain(
            e.document.getText(), 
            e.document.uri, 
            false
        );
        const newHash = hexlify(h1);
        if (h2 !== undefined) {
            const oldHash = hexlify(h2);
            const changes: { [uri: string]: TextEdit[] } = {};
            hashMap.forEach((imports, uri) => {
                if (uri !== e.document.uri) {
                    const imp = imports.find(
                        e => e.hash.toLowerCase() === oldHash.toLowerCase()
                    );
                    if (imp) changes[uri] = [{ range: imp.range, newText: newHash }];
                }
            });
            if (Object.keys(changes).length > 0) connection.workspace.applyEdit(
                { changes }
            ).then(
                () => {
                    for (const uri in changes) {
                        const doc = documents.get(uri);
                        if (doc !== undefined) setHashMap(doc.getText(), uri);
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
    }
});

connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log("We received an file change event");
});

connection.onCompletion(params => {
    const textDoc = documents.get(params.textDocument.uri);
    if (textDoc?.languageId === "rainlang") return langServices.doComplete(
        toTextDocumentItem(textDoc), 
        params.position,
        MarkupKind.Markdown
    );
    else return null;
});

connection.onCompletionResolve(item => item);

connection.onHover(params => {
    const textDoc = documents.get(params.textDocument.uri);
    if (textDoc?.languageId === "rainlang") return langServices.doHover(
        toTextDocumentItem(textDoc), 
        params.position,
        MarkupKind.Markdown
    );
    else return null;
});

// provide semantic token highlighting
connection.languages.semanticTokens.on(async e => {
    const textDoc = documents.get(e.textDocument.uri);
    try {
        if (textDoc?.languageId === "rainlang") return langServices.semanticTokens(
            toTextDocumentItem(textDoc), 
            0,
            1
        );
        else return { data: [] };
    }
    catch {
        return { data: [] };
    }
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
async function validate(uri: string, text: string, version: number, languageId: string) {
    if (languageId === "rainlang") {
        langServices.doValidateAsync({ uri, text, version, languageId }, true).then(
            diagnostics => {
                if (version === documents.get(uri)?.version) {
                    connection.sendDiagnostics({ uri, diagnostics });    
                }
            },
            () => { /**/ }
        );
    }
}

async function setHashMap(text: string, uri: string) {
    const _td = TextDocument.create(uri, "rainlang", 0, text);
    const _rd = RainDocument.create(text, metaStore);
    hashMap.set(
        uri, 
        _rd.imports.map(v => ({
            hash: v.hash.toLowerCase(), 
            range: Range.create(
                _td.positionAt(v.hashPosition[0]),
                _td.positionAt(v.hashPosition[1])
            ) 
        }))
    );
}

function toTextDocumentItem(textDocument: TextDocument): TextDocumentItem {
    return {
        text: textDocument.getText(),
        uri: textDocument.uri,
        version: textDocument.version,
        languageId: textDocument.languageId
    };
}