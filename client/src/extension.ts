import * as path from 'path';
import { format } from 'prettier';
import * as vscode from 'vscode';
import { workspace, ExtensionContext } from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';


let client: LanguageClient;

export async function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('dist', 'server.js')
	);

	// get the initial settings and pass them as initialzeOptions to server
	const initSettings = vscode.workspace.getConfiguration("rainlang");
	
	// channel for rainlang compiler
	let rainlangCompilerChannel: vscode.OutputChannel;

	// handler for rainlang compiler, send the request to server and logs the result in output channel
	const rainlangCompileHandler = async() => {
		const result = await vscode.commands.executeCommand(
			"_compile",
			vscode.window.activeTextEditor.document.languageId,
			vscode.window.activeTextEditor.document.uri.toString(),
			{
				start: vscode.window.activeTextEditor.selection.start,
				end: vscode.window.activeTextEditor.selection.end,
			}
		);
		if (!rainlangCompilerChannel) 
			rainlangCompilerChannel = vscode.window.createOutputChannel("Rain Language Compiler", "json");
		rainlangCompilerChannel.show(true);
		if (result) rainlangCompilerChannel.appendLine(format(
			JSON.stringify(result, null, 4), 
			{ parser: "json" }
		));
		else rainlangCompilerChannel.appendLine("undefined");
  };

	// register the command
  context.subscriptions.push(vscode.commands.registerCommand("rainlang.compile", rainlangCompileHandler));

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: "file", language: "rainlang" },
			{ language: "javascript" },
			{ language: "typescript" }
		],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: [
				// workspace.createFileSystemWatcher('**/*.rain'),
				workspace.createFileSystemWatcher('**/.clientrc')
			]
		},
		initializationOptions: initSettings
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'rainlang',
		'Rain Language',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	await client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
