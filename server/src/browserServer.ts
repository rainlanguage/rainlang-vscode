import { getOpMeta } from "./utils";
import { TextDocument } from "vscode-languageserver-textdocument";
import { 
    getRainHover, 
    RainDocument, 
    ClientCapabilities, 
    getRainCompletion, 
    getRainDiagnostics 
} from "@rainprotocol/rainlang";
import {
    BrowserMessageReader, 
    BrowserMessageWriter, 
    createConnection,
    TextDocuments,
    Diagnostic, 
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    TextDocumentSyncKind,
    InitializeResult,
    CompletionParams,
    HoverParams,
    Range,
    Hover,
    ExecuteCommandParams 
} from "vscode-languageserver/browser";


/* browser specific setup code */
const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

/* from here on, all code is non-browser specific and could be shared with a regular extension */
// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// tracking rain docuemtns instances
const rainDocuments: Map<string, RainDocument> = new Map();
const inlineRainDocuments: Map<
	string, 
	{ rainDocument: RainDocument, range: Range, hasLiteralTemplate: boolean }[]
> = new Map();

let opmeta = "";
let hasWorkspaceFolderCapability = false;

connection.onInitialize(async(params: InitializeParams) => {
    const capabilities = params.capabilities;
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    // assign op meta at initialization
    if (params.initializationOptions?.opmeta) {
        const _opmeta = JSON.parse(params.initializationOptions.opmeta);
        opmeta = typeof _opmeta === "string"
            ? _opmeta
            : await getOpMeta(_opmeta);
    }

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
connection.onExecuteCommand((e: ExecuteCommandParams) => {
    if (e.command === "_compile") {
        const langId = e.arguments![0];
        const uri = e.arguments![1];
        if (langId === "rainlang") {
            const _rainDoc = rainDocuments.get(uri);
            if (_rainDoc) return _rainDoc.getExpressionConfig();
            else return null;
        }
        else return null;
    }
});

// gets the rainlang settings
async function getSetting() {
    return await connection.workspace.getConfiguration({
        section: "rainlang"
    });
}

connection.onDidChangeConfiguration(async() => {
    const settings = await getSetting();
    if (settings?.opmeta) {
        opmeta = typeof settings.opmeta === "string"
            ? settings.opmeta
            : await getOpMeta(settings.opmeta);
    }
    else opmeta = "";
    rainDocuments.clear();
    inlineRainDocuments.clear();
    documents.all().forEach(v => {
        if (v.languageId === "rainlang") {
            const _rainDoc = new RainDocument(v, opmeta);
            rainDocuments.set(v.uri, _rainDoc);
            doValidate(_rainDoc);
        }
    });
});

documents.onDidOpen(v => {
    if (v.document.languageId === "rainlang") {
        const _rainDoc = new RainDocument(v.document, opmeta);
        rainDocuments.set(v.document.uri, _rainDoc);
        doValidate(_rainDoc);
    }
});

documents.onDidClose(v => {
    connection.sendDiagnostics({ uri: v.document.uri, diagnostics: []});
    if (v.document.languageId === "rainlang") {
        rainDocuments.delete(v.document.uri);
    }
});

documents.onDidChangeContent(change => {
    if (change.document.languageId === "rainlang") {
        const _rainDoc = rainDocuments.get(change.document.uri);
        if (_rainDoc) {
            _rainDoc.update(change.document);
            doValidate(_rainDoc);
        }
        else {
            const _rainDoc = new RainDocument(change.document, opmeta);
            rainDocuments.set(change.document.uri, _rainDoc);
            doValidate(_rainDoc);
        }
    }
});

async function doValidate(rainDocument: RainDocument, uri?: string): Promise<void> {
    const _td = rainDocument.getTextDocument();
    const diagnostics: Diagnostic[] = await getRainDiagnostics(
        rainDocument, 
        { clientCapabilities: ClientCapabilities.ALL }
    );

    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: uri ? uri : _td.uri, diagnostics });
}

connection.onCompletion(
    (params: CompletionParams): CompletionItem[] => {
        let _rd: RainDocument | undefined;
        if (
            params.textDocument.uri.endsWith(".rain") ||
			params.textDocument.uri.endsWith(".rainlang") ||
			params.textDocument.uri.endsWith(".rl")
        ) {
            _rd = rainDocuments.get(params.textDocument.uri);
        }
        if (_rd) {
            const completions = getRainCompletion(
                _rd, 
                params.position, 
                { clientCapabilities: ClientCapabilities.ALL }
            );
            if (completions) return completions;
            else return [];
        }
        else return [];
    }
);

connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        return item;
    }
);

connection.onHover(
    (params: HoverParams): Hover | null => {
        let _rd: RainDocument | undefined;
        if (
            params.textDocument.uri.endsWith(".rain") ||
			params.textDocument.uri.endsWith(".rainlang") ||
			params.textDocument.uri.endsWith(".rl")
        ) {
            _rd = rainDocuments.get(params.textDocument.uri);
        }
        if (_rd) {
            return getRainHover(
                _rd, 
                params.position, 
                { clientCapabilities: ClientCapabilities.ALL }
            );
        }
        else return null;
    }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
