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
            // { language: "javascript" },
            // { language: "typescript" }
        ],
        synchronize: {},
        initializationOptions: JSON.stringify(initSettings)
    };

    // channel for rainlang compiler
    let rainlangCompilerChannel: vscode.OutputChannel;

    // handler for rainlang compiler, send the request to server and logs the result in output channel
    const rainlangCompileHandler = async() => {
        const expKeys = Array.from((await vscode.window.showInputBox({
            title: "Expression Names",
            placeHolder: "binding-1 binding-2 ...",
            prompt: "specify the expression names in order by a whitespace seperating them"
        })).matchAll(/[^\s]+/g)).map(v => v[0]);
        const result = await vscode.commands.executeCommand(
            "_compile",
            vscode.window.activeTextEditor.document.languageId,
            vscode.window.activeTextEditor.document.uri.toString(),
            JSON.stringify(expKeys),
            {
                start: vscode.window.activeTextEditor.selection.start,
                end: vscode.window.activeTextEditor.selection.end,
            }
        );
        if (!rainlangCompilerChannel) rainlangCompilerChannel = vscode.window.createOutputChannel(
            "Rain Language Compiler",
            "json"
        );
        rainlangCompilerChannel.show(true);
        if (result) rainlangCompilerChannel.appendLine(format(
            JSON.stringify(result, null, 2), 
            { parser: "json", plugins: [ babelParser ] }
        ));
        else rainlangCompilerChannel.appendLine("undefined");
    };

    // // register the command
    context.subscriptions.push(vscode.commands.registerCommand(
        "rainlang.compile", 
        rainlangCompileHandler
    ));

    // auto compile on save implementation
    vscode.workspace.onDidSaveTextDocument(async e => {
        const autoCompile = vscode.workspace.getConfiguration("rainlang.autoCompile");
        if (typeof autoCompile.onSave === "string" && autoCompile.onSave) {
            const workspaceRootUri = getCurrentWorkspaceDir();
            if (workspaceRootUri) {
                try {
                    const mappingFileUri = vscode.Uri.joinPath(
                        workspaceRootUri, 
                        autoCompile.onSave
                    );
                    const content = JSON.parse(
                        String.fromCharCode.apply(
                            null, (
                                await vscode.workspace.fs.readFile(mappingFileUri)
                            )
                        )
                    );
                    if (Array.isArray(content) && content.length) {
                        const ENTRYPOINT_PATTERN = /^[a-z][0-9a-z-]*$/;
                        const JSON_PATH_PATTERN = /^(\.\/)(\.\/|\.\.\/|[^]*\/)*[^]+\.json$/;
                        const DOTRAIN_PATH_PATTERN = /^(\.\/)(\.\/|\.\.\/|[^]*\/)*[^]+\.rain$/;
                        const filesToCompile: {
                            dotrain: vscode.Uri,
                            json: vscode.Uri,
                            entrypoints: string[]
                        }[] = content?.map((v: any) => {
                            if (
                                typeof v.dotrain === "string"
                                && DOTRAIN_PATH_PATTERN.test(v.dotrain)
                                && typeof v.json === "string"
                                && JSON_PATH_PATTERN.test(v.json)
                                && Array.isArray(v.entrypoints)
                                && v.entrypoints.length
                                && v.entrypoints.every((name: any) => 
                                    typeof name === "string"
                                    && ENTRYPOINT_PATTERN.test(name)
                                )
                            ) {
                                try {
                                    const dotrain = vscode.Uri.joinPath(
                                        workspaceRootUri,
                                        v.dotrain
                                    );
                                    const json = vscode.Uri.joinPath(
                                        workspaceRootUri,
                                        v.json
                                    );
                                    if (dotrain && json) {
                                        return { 
                                            dotrain, 
                                            json, 
                                            entrypoints: v.entrypoints 
                                        };
                                    }
                                    else return undefined;
                                }
                                catch { return undefined; }
                            }
                            else return undefined;
                        })?.filter(v => 
                            v !== undefined && v.dotrain.toString() === e.uri.toString()
                        ) ?? [];
                        if (filesToCompile.length) {
                            const workspaceEdit = new vscode.WorkspaceEdit();
                            for (let i = 0; i < filesToCompile.length; i++) {
                                const result = await vscode.commands.executeCommand(
                                    "_compile",
                                    e.languageId,
                                    e.uri.toString(),
                                    JSON.stringify(filesToCompile[i].entrypoints)
                                );
                                const contents = Uint8Array.from(
                                    Array.from(
                                        result
                                            ? format(
                                                JSON.stringify(result, null, 2), 
                                                { parser: "json", plugins: [ babelParser ] }
                                            )
                                            : "\"failed to compile!\""
                                    ).map(v => v.charCodeAt(0))
                                );
                                workspaceEdit.createFile(
                                    filesToCompile[i].json,
                                    { overwrite: true, contents }
                                );
                            }
                            vscode.workspace.applyEdit(workspaceEdit);
                        }
                    }
                }
                catch (err) {
                    vscode.window.showErrorMessage(
                        (err as Error).message
                    );
                    vscode.window.showErrorMessage(
                        "Failed to find mapping file or it contains invalid content"
                    );
                }
            }
        }
    });

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
    if (!client) return undefined;
    return client.stop();
}

function getCurrentWorkspaceDir(): vscode.Uri | undefined {
    const currentWorkspaceEditor = vscode.window.activeTextEditor?.document.uri;
    return currentWorkspaceEditor 
        ? vscode.workspace.getWorkspaceFolder(currentWorkspaceEditor)?.uri 
        : undefined;
}