import * as vscode from "vscode";
import { format } from "prettier/standalone";
import babelParser from "prettier/parser-babel";
import { LanguageClient, LanguageClientOptions } from "vscode-languageclient/browser";


let client: LanguageClient;

// this method is called when vs code is activated
export async function activate(context: vscode.ExtensionContext) {

	// get the initial settings and pass them as initialzeOptions to server
	const initSettings = vscode.workspace.getConfiguration("rainlang");

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ language: "rainlang" },
			{ language: "javascript" },
			{ language: "typescript" }
		],
		synchronize: {},
		initializationOptions: { opmeta: JSON.stringify(initSettings.opmeta) }
	};

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
		if (!rainlangCompilerChannel) rainlangCompilerChannel = vscode.window.createOutputChannel(
			"Rain Language Compiler", "json"
		);
		rainlangCompilerChannel.show(true);
		if (result) rainlangCompilerChannel.appendLine(format(
			JSON.stringify(result, null, 4), 
      { parser: "json",  plugins: [babelParser] }
		));
		else rainlangCompilerChannel.appendLine("undefined");
  };

	// // register the command
  context.subscriptions.push(vscode.commands.registerCommand(
		"rainlang.compile", 
		rainlangCompileHandler
	));

	// Create a worker. The worker main file implements the language server.
	const serverMain = vscode.Uri.joinPath(context.extensionUri, "dist/browser/server.js");
	const worker = new Worker(serverMain.toString(true));

	// create the language server client to communicate with the server running in the worker
	const client = new LanguageClient(
		"rainlang", 
		"Rain Language", 
		clientOptions, 
		worker
	);

	await client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
