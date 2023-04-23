import { TextDocument } from "vscode-languageserver-textdocument";
import { 
    MetaStore,
    RainDocument, 
    ClientCapabilities, 
    RainLanguageServices,
    getRainLanguageServices
} from "@rainprotocol/rainlang";
import {
    Diagnostic,
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

let langServices: RainLanguageServices;
const metaStore = new MetaStore();
let hasWorkspaceFolderCapability = false;

connection.onInitialize(async(params) => {
    const capabilities = params.capabilities;
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    // add subgraphs to metaStore
    if (params.initializationOptions?.subgraphs) {
        for (const sg of params.initializationOptions.subgraphs) {
            metaStore.addSubgraph(sg);
        }
    }

    langServices = getRainLanguageServices({
        clientCapabilities: ClientCapabilities.ALL,
        metaStore
    });

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                completionItem: {
                    labelDetailsSupport: true
                }
            },
            hoverProvider: true,
            executeCommandProvider: {
                commands: ["_compile"]
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
connection.onExecuteCommand(async(e) => {
    if (e.command === "_compile") {
        const langId = e.arguments![0];
        const uri = e.arguments![1];
        // const range = e.arguments![2];
        if (langId === "rainlang") {
            const _doc = documents.get(uri);
            if (_doc) {
                const _rainDoc = await RainDocument.create(_doc, metaStore);
                return _rainDoc.getExpressionConfig();
            }
            else return null;
        }
        else return null;
    }
});

connection.onDidChangeConfiguration(async() => {
    const settings = await getSetting();
    if (settings?.subgraphs) {
        for (const sg of settings.subgraphs) {
            metaStore.addSubgraph(sg);
        }
    }
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
    if (textDoc) return langServices.doComplete(
        textDoc, 
        params.position
    );
    else return null;
});

connection.onCompletionResolve(item => item);

connection.onHover(params => {
    const textDoc = documents.get(params.textDocument.uri);
    if (textDoc) return langServices.doHover(
        textDoc, 
        params.position
    );
    else return null;
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
    const diagnostics: Diagnostic[] = await langServices.doValidation(
        textDocument
    );

    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
