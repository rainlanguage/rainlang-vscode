import { getOpMeta, isInRange } from './utils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClientCapabilities, getRainCompletion, getRainDiagnostics, getRainHover, RainDocument } from '@rainprotocol/rainlang';
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
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
} from 'vscode-languageserver/node';


// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

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
		opmeta = typeof params.initializationOptions.opmeta === "string"
			? params.initializationOptions.opmeta
			: await getOpMeta(params.initializationOptions.opmeta);
	}

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: {
				resolveProvider: true
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
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// executes rain compile command
connection.onExecuteCommand((e: ExecuteCommandParams) => {
	if (e.command === "_compile") {
		const langId = e.arguments![0];
		const uri = e.arguments![1];
		// const range = e.arguments![2];
		if (langId === "rainlang") {
			const _rainDoc = rainDocuments.get(uri);
			if (_rainDoc) return _rainDoc.getExpressionConfig();
			else return null;
		}
		else return null;
		// else {
		// 	const _inline = inlineRainDocuments.get(uri);
		// 	if (_inline) {
		// 		for (let i = 0; i < _inline.length; i++) {
		// 			if (
		// 				isInRange(_inline[i].range, range.start) && 
		// 				isInRange(_inline[i].range, range.end)
		// 			) {
		// 				if (!_inline[i].hasLiteralTemplate) 
		// 					return _inline[i].rainDocument.getExpressionConfig();
		// 				else return null;
		// 			}
		// 		}
		// 		return null;
		// 	}
		// 	return null;
		// }
	}
});

// gets the rainlang settings
async function getSetting() {
	return await connection.workspace.getConfiguration({
		section: 'rainlang'
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
		// else {
		// 	const _embeded = embeddedRainlang(v, opmeta);
		// 	if (_embeded) {
		// 		inlineRainDocuments.set(v.uri, _embeded);
		// 		// for (let i = 0; i < _embeded.length; i++) {
		// 		// 	doValidate(_embeded[i].rainDocument, v.uri);
		// 		// }
		// 	}
		// }
	});
});

documents.onDidOpen(v => {
	if (v.document.languageId === "rainlang") {
		const _rainDoc = new RainDocument(v.document, opmeta);
		rainDocuments.set(v.document.uri, _rainDoc);
		doValidate(_rainDoc);
	}
	// else {
	// 	const _embeded = embeddedRainlang(v.document, opmeta);
	// 	if (_embeded) {
	// 		inlineRainDocuments.set(v.document.uri, _embeded);
	// 		// for (let i = 0; i < _embeded.length; i++) {
	// 		// 	doValidate(_embeded[i].rainDocument, v.document.uri);
	// 		// }
	// 	}
	// }
});

documents.onDidClose(v => {
	connection.sendDiagnostics({ uri: v.document.uri, diagnostics: []});
	if (v.document.languageId === "rainlang") {
		rainDocuments.delete(v.document.uri);
	}
	// else {
	// 	inlineRainDocuments.delete(v.document.uri);
	// }
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
	// else {
	// 	inlineRainDocuments.delete(change.document.uri);
	// 	const _embeded = embeddedRainlang(change.document, opmeta);
	// 	if (_embeded) {
	// 		inlineRainDocuments.set(change.document.uri, _embeded);
	// 		// for (let i = 0; i < _embeded.length; i++) {
	// 		// 	doValidate(_embeded[i].rainDocument, change.document.uri);
	// 		// }
	// 	}
	// }
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

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

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
		// else {
		// 	const _inline = inlineRainDocuments.get(params.textDocument.uri);
		// 	if (_inline) {
		// 		for (let i = 0; i < _inline.length; i++) {
		// 			if (isInRange(_inline[i].range, params.position)) {
		// 				_rd = _inline[i].rainDocument;
		// 				break;
		// 			}
		// 		}
		// 	}
		// }
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
		// else {
		// 	const _inline = inlineRainDocuments.get(params.textDocument.uri);
		// 	if (_inline) {
		// 		for (let i = 0; i < _inline.length; i++) {
		// 			if (isInRange(_inline[i].range, params.position)) {
		// 				_rd = _inline[i].rainDocument;
		// 				break;
		// 			}
		// 		}
		// 	}
		// }
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
