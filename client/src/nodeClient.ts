import * as path from "path";
import * as vscode from "vscode";
import { format } from "prettier";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";


let client: LanguageClient;
const defaultConfigPath = "./rainconfig.json";

export async function activate(context: vscode.ExtensionContext) {

    // status of the client/server
    const extStatus = { onsave: true, active: true };

    // disposables to free at server stop
    let disposables: vscode.Disposable[] = [];

    // default config uri set at the fisrt start of the server
    let defaultConfigUri: vscode.Uri;

    // config file URI
    let configUri: vscode.Uri;

    // workspace root URI
    let workspaceRootUri: vscode.Uri;

    // directories to check for rain documents, default is "src"
    let watched: vscode.Uri[] = [];

    // channel for rainlang compiler
    let compilerChannel: vscode.OutputChannel;

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join("dist", "node", "server.js")
    );

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
            { language: "rainlang" },
            // { pattern: "*rainconfig.json", language: "json" }
        ],
        synchronize: {
            // Notify the server about file changes to ".clientrc files contained in the workspace
            // fileEvents: [
            //     vscode.workspace.createFileSystemWatcher("**/.clientrc")
            // ]
        },
        // initializationOptions: initConfig
    };

    // setup the statusbar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBar.text = "rainlang-ext";
    updateStatus();

    // add subscriptions
    context.subscriptions.push(
        statusBar,
        vscode.commands.registerCommand("rainlang.start", start),
        vscode.commands.registerCommand("rainlang.stop", stop),
        vscode.commands.registerCommand("rainlang.restart", restart),
        // vscode.commands.registerCommand("rainlang.onsave", updateOnSaveCompile),
        vscode.commands.registerCommand("rainlang.compose", composeHandler),
        // vscode.commands.registerCommand("rainlang.compile.all", compileAllHandler)
    );
    
    function updateStatus() {
        statusBar.hide();
        if (extStatus.active) {
            statusBar.tooltip = new vscode.MarkdownString("Rainlang Extension (running)", true);
            statusBar.tooltip.isTrusted = true;
            statusBar.tooltip.appendMarkdown([
                "\n\n[Stop Server](command:rainlang.stop)",
                "\n\n[Restart Server](command:rainlang.restart)",
                // "\n\n---\n\n",
                // "\n\n[Compile](command:rainlang.compile.all)",
            ].join(""));
            // if (extStatus.onsave) statusBar.tooltip.appendMarkdown(
            //     "\n\n[Turn Off Compile-On-Save](command:rainlang.onsave)",
            // );
            // else statusBar.tooltip.appendMarkdown(
            //     "\n\n[Turn On Compile-On-Save](command:rainlang.onsave)",
            // );
        }
        else {
            statusBar.tooltip = new vscode.MarkdownString("Rainlang Extension (stopped)", true);
            statusBar.tooltip.isTrusted = true;
            statusBar.tooltip.appendMarkdown("\n\n[Start Server](command:rainlang.start)");
        }
        statusBar.show();
    }

    // handler for rainlang composer, send the request to server and logs the result in output channel
    async function composeHandler() {
        if (client && extStatus.active) {
            const expKeys = Array.from((await vscode.window.showInputBox({
                title: "Expression Names",
                placeHolder: "binding-1 binding-2 ...",
                prompt: "specify the expression names in order by a whitespace seperating them"
            })).matchAll(/[^\s]+/g)).map(v => v[0]);
            if (!compilerChannel) compilerChannel = vscode.window.createOutputChannel(
                "Rain Language Compiler",
                // "code-runner-output"
            );
            try {
                const result = await vscode.commands.executeCommand(
                    "_compose",
                    vscode.window.activeTextEditor.document.languageId,
                    vscode.window.activeTextEditor.document.uri.toString(),
                    expKeys,
                    // {
                    //     start: vscode.window.activeTextEditor.selection.start,
                    //     end: vscode.window.activeTextEditor.selection.end,
                    // }
                );
                compilerChannel.show(true);
                if (result[1]) {
                    compilerChannel.appendLine([
                        new Date(),
                        result[0],
                    ].join("\n\n"));
                } else {
                    compilerChannel.appendLine([
                        new Date(),
                        JSON.stringify(result[0], null, 2),
                    ].join("\n\n"));
                }
            } catch(e) {
                console.log(e);
                compilerChannel.show(true);
                compilerChannel.appendLine([
                    new Date(),
                    JSON.stringify(e, null, 2),
                ].join("\n\n"));
            }
        }
        else vscode.window.showErrorMessage("rain language server is not running!");
    }

    async function restart() {
        if (!extStatus.active) {
            vscode.window.showWarningMessage("rain language server is not running!");
        }
        else await client?.restart();
    }

    async function stop() {
        if (!extStatus.active) {
            vscode.window.showWarningMessage("rain language server is not running!");
        }
        else {
            watched = [];
            configUri = undefined;
            disposables.forEach(v => v?.dispose());
            disposables = [];
            await client.stop();
            client = undefined;
            extStatus.active = false;
            updateStatus();
        }
    }

    async function start() {
        if (extStatus.active) {
            vscode.window.showWarningMessage("rain language server is already running!");
        }
        else await _start();
    }

    async function _start() {
        // auto compile on save implementation
        disposables.push(vscode.workspace.onDidSaveTextDocument(async e => {
            try {
                if (e.uri.toString() === configUri.toString()) {
                    const content = JSON.parse(e.getText());
                    processConfig(content);
                }
            }
            catch { 
                watched = [];
            }
        }));

        disposables.push(vscode.workspace.onDidCreateFiles(async created => {
            let didProcessConfig = false;
            if (configUri === undefined && defaultConfigUri !== undefined) {
                for (let i = 0; i < created.files.length; i++) {
                    if (created.files[i].toString() === defaultConfigUri.toString()) {
                        try {
                            configUri = defaultConfigUri;
                            const content = JSON.parse(
                                (await vscode.workspace.fs.readFile(defaultConfigUri)).toString()
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                        catch {
                            watched = [];
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                }
            }
            if (!didProcessConfig && configUri !== undefined) reloadWatched();
        }));

        disposables.push(vscode.workspace.onDidDeleteFiles(deleted => {
            if (configUri !== undefined) {
                for (let i = 0; i < deleted.files.length; i++) {
                    try {
                        if (deleted.files[i].toString() === configUri.toString()) {
                            watched = [];
                            configUri = undefined;
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                    catch { /**/ }
                }
            }
            if (configUri !== undefined) reloadWatched();
        }));

        disposables.push(vscode.workspace.onDidRenameFiles(async renamed => {
            let didProcessConfig = false;
            if (configUri === undefined) {
                if(defaultConfigUri !== undefined) for(let i = 0; i < renamed.files.length; i++) {
                    try {
                        if (renamed.files[i].newUri.toString() === defaultConfigUri.toString()) {
                            configUri = defaultConfigUri;
                            const content = JSON.parse(
                                (await vscode.workspace.fs.readFile(defaultConfigUri)).toString()
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                    }
                    catch { 
                        watched = [];
                        client.sendNotification("unwatch-all");
                        break;
                    }
                }
            }
            else {
                for (let i = 0; i < renamed.files.length; i++) {
                    try {
                        if (renamed.files[i].oldUri.toString() === configUri.toString()) {
                            if(renamed.files[i].newUri.toString() === defaultConfigUri?.toString()){
                                configUri = defaultConfigUri;
                                break;
                            }
                            watched = [];
                            configUri = undefined;
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                    catch { /**/ }
                }
            }
            if (!didProcessConfig && configUri) reloadWatched();
        }));

        // const myProvider = new (class implements vscode.InlayHintsProvider {
        // 	provideInlayHints(
        // 		document: vscode.TextDocument, 
        // 		range: vscode.Range
        // 	): vscode.ProviderResult<vscode.InlayHint[]> {
        // 		return [new vscode.InlayHint(new vscode.Position(0, 0), "hello")];
        // 	}
        // });
        // context.subscriptions.push(
        // 	vscode.languages.registerInlayHintsProvider(
        // 		[{language: "rainlang"}, {language: "javascript"}], 
        // 		myProvider
        // 	)
        // );

        // Create the language client and start the client.
        client = new LanguageClient(
            "rainlang",
            "Rain Language",
            serverOptions,
            clientOptions
        );

        // Start the client. This will also launch the server
        await client.start();

        // set the workspace root URI on startup
        disposables.push(client.onNotification("request-config", async e => {
            if (e !== null) {
                workspaceRootUri = vscode.Uri.parse(e);
                // wait for server to fully start
                // await sleep(6000);
                try {
                    defaultConfigUri = vscode.Uri.joinPath(workspaceRootUri, defaultConfigPath);
                    const exists = await isConfig(defaultConfigUri);
                    if (exists) configUri = defaultConfigUri;
                    const content = JSON.parse(
                        (await vscode.workspace.fs.readFile(configUri)).toString()
                    );
                    processConfig(content);
                }
                catch {
                    watched = [];
                }
            }
        }));
        extStatus.active = true;
        updateStatus();
    }

    // start server once
    await _start();

    // reload .rain watched files
    async function reloadWatched() {
        const promiseGroup1: any[] = [];
        const promiseGroup2: any[] = [];
        const promiseGroup3: any[] = [];
        await client.sendNotification("unwatch-all");
        for (const dir of watched) {
            promiseGroup1.push(vscode.workspace.fs.stat(dir).then(stat => {
                if (stat.type !== vscode.FileType.Directory) {
                    if (stat.type === vscode.FileType.File && dir.toString().endsWith(".rain")) {
                        promiseGroup3.push(vscode.workspace.fs.readFile(dir).then(
                            v => client.sendNotification(
                                "watch-dotrain", 
                                [dir.toString(), v.toString()]
                            ),
                            () => { /**/ }
                        ));
                    }
                }
                else promiseGroup2.push(vscode.workspace.findFiles(
                    new vscode.RelativePattern(dir, "**/*.rain"), 
                    "**​/node_modules/**"
                ).then(
                    v => v.forEach(doc => promiseGroup3.push(
                        vscode.workspace.fs.readFile(doc).then(
                            e => client.sendNotification(
                                "watch-dotrain", 
                                [doc.toString(), e.toString()]
                            ),
                            () => { /**/ }
                        )
                    )),
                    () => { /**/ }
                ));
            }));
        }
        await Promise.allSettled(promiseGroup1);
        await Promise.allSettled(promiseGroup2);
        await Promise.allSettled(promiseGroup3);
        client.sendNotification("reval-all");
    }

    // processes the configuration file contents
    async function processConfig(content: any) {
        const newWatched: vscode.Uri[] = [];
        const promiseGroup1: any[] = [];
        const promiseGroup2: any[] = [];
        const promiseGroup3: any[] = [];
        await client.sendNotification("unwatch-all");
        updateMetaStore(content, workspaceRootUri);

        // find .rains on startup and send them to server for storing in meta store
        if (
            content?.include?.length > 0 && 
            Array.isArray(content.include) && 
            content.include.every((v: any) => typeof v === "string")
        ) {
            for (let i = 0; i < content.include.length; i++) {
                const dir = vscode.Uri.joinPath(workspaceRootUri, content.include[i]);
                newWatched.push(dir);
                promiseGroup1.push(vscode.workspace.fs.stat(dir).then(stat => {
                    if (stat.type !== vscode.FileType.Directory) {
                        if (stat.type === vscode.FileType.File && dir.toString().endsWith(".rain")) {
                            promiseGroup3.push(vscode.workspace.fs.readFile(dir).then(
                                v => client.sendNotification(
                                    "watch-dotrain", 
                                    [dir.toString(), v.toString()]
                                ),
                                () => { /**/ }
                            ));
                        }
                    }
                    else promiseGroup2.push(vscode.workspace.findFiles(
                        new vscode.RelativePattern(dir, "**/*.rain"), 
                        "**​/node_modules/**"
                    ).then(
                        v => v.forEach(doc => promiseGroup3.push(
                            vscode.workspace.fs.readFile(doc).then(
                                e => client.sendNotification(
                                    "watch-dotrain", 
                                    [doc.toString(), e.toString()]
                                ),
                                () => { /**/ }
                            )
                        )),
                        () => { /**/ }
                    ));
                }));
            }
        }
        watched = newWatched;
        await Promise.allSettled(promiseGroup1);
        await Promise.allSettled(promiseGroup2);
        await Promise.allSettled(promiseGroup3);
        client.sendNotification("reval-all");
    }
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

async function sleep(ms: number) {
    let _to;
    return new Promise(
        resolve => _to = setTimeout(resolve, ms)
    ).finally(
        () => clearTimeout(_to)
    );
}

function hexlify(value: Uint8Array): string {
    let result = "0x";
    for (let i = 0; i < value.length; i++) {
        result += value[i].toString(16).padStart(2, "0");
    }
    return result;
}

function arrayify(value: string): Uint8Array {
    const array: number[] = [];
    const v = value.startsWith("0x") ? value.substring(2) : value;
    for (let i = 0; i < v.length; i += 2) {
        array.push(parseInt(v.substring(i, i + 2), 16));
    }
    return Uint8Array.from(array);
}

// update meta store
async function updateMetaStore(content: any, workspaceRootUri: vscode.Uri): Promise<void> {
    const metas = [];
    const subgraphs = [];
    const deployers = [];
    if (content.subgraphs) {
        if (
            Array.isArray(content.subgraphs) && 
            content.subgraphs.every((v: any) => typeof v === "string")
        ) subgraphs.push(...content.subgraphs);
    }
    client.sendNotification("update-meta-store", [subgraphs]);
}

// checks if a config file exists
async function isConfig(uri: vscode.Uri): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.File) return true;
        else return false;
    }
    catch (error) {
        return false;
    }
}