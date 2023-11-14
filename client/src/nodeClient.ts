import * as path from "path";
import * as vscode from "vscode";
import { format } from "prettier";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";


let client: LanguageClient;
const defaultConfigPath1 = "./rainconfig.json";
const defaultConfigPath2 = "./.rainconfig.json";

export async function activate(context: vscode.ExtensionContext) {

    // status of the client/server
    const extStatus = { onsave: true, active: true };

    // disposables to free at server stop
    let disposables: vscode.Disposable[] = [];

    // default config uri set at the fisrt start of the server
    let defaultConfigUri1: vscode.Uri;
    let defaultConfigUri2: vscode.Uri;

    // config file URI
    let configUri: vscode.Uri;

    // workspace root URI
    let workspaceRootUri: vscode.Uri;

    // directories to check for rain documents, default is "src"
    let watched: vscode.Uri[] = [];

    // auto compile mappings
    const compile = { onSave: [] };

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
            { pattern: "*rainconfig.json", language: "json" }
        ],
        synchronize: {
            // Notify the server about file changes to ".clientrc files contained in the workspace
            // fileEvents: [
            //     vscode.workspace.createFileSystemWatcher("**/.clientrc")
            // ]
        },
        // initializationOptions: initConfig
    };

    // get the initial settings and pass them as initialzeOptions to server
    // const initSettings = vscode.workspace.getConfiguration("rainlang");

    // setting the config file at startup
    // const configPath = initSettings.config
    //     ? initSettings.config as string 
    //     : defaultConfigPath;

    // const configPath = defaultConfigPath;

    // // setup the config file on config change
    // vscode.workspace.onDidChangeConfiguration(async e => {
    //     if (e.affectsConfiguration("rainlang.config")) {
    //         try {
    //             if (workspaceRootUri) {
    //                 const newPath = vscode.workspace.getConfiguration("rainlang").config;
    //                 const newConfigPath = newPath && typeof newPath === "string" 
    //                     ? newPath 
    //                     : defaultConfigPath;
    //                 configUri = vscode.Uri.joinPath(workspaceRootUri, newConfigPath);
    //                 const content = JSON.parse(
    //                     (await vscode.workspace.fs.readFile(configUri)).toString()
    //                 );
    //                 processConfig(content);
    //             }
    //         }
    //         catch {
    //             watched = [];
    //             compile.onSave = [];
    //             vscode.window.showErrorMessage(
    //                 "Cannot find or read the config file"
    //             );
    //         }
    //     }
    // });

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
        vscode.commands.registerCommand("rainlang.onsave", updateOnSaveCompile),
        vscode.commands.registerCommand("rainlang.compile", compileCurrentHandler),
        vscode.commands.registerCommand("rainlang.compile.all", compileAllHandler)
    );
    
    function updateStatus() {
        statusBar.hide();
        if (extStatus.active) {
            statusBar.tooltip = new vscode.MarkdownString("Rainlang Extension (running)", true);
            statusBar.tooltip.isTrusted = true;
            statusBar.tooltip.appendMarkdown([
                "\n\n[Stop Server](command:rainlang.stop)",
                "\n\n[Restart Server](command:rainlang.restart)",
                "\n\n---\n\n",
                "\n\n[Compile](command:rainlang.compile.all)",
            ].join(""));
            if (extStatus.onsave) statusBar.tooltip.appendMarkdown(
                "\n\n[Turn Off Compile-On-Save](command:rainlang.onsave)",
            );
            else statusBar.tooltip.appendMarkdown(
                "\n\n[Turn On Compile-On-Save](command:rainlang.onsave)",
            );
        }
        else {
            statusBar.tooltip = new vscode.MarkdownString("Rainlang Extension (stopped)", true);
            statusBar.tooltip.isTrusted = true;
            statusBar.tooltip.appendMarkdown("\n\n[Start Server](command:rainlang.start)");
        }
        statusBar.show();
    }

    // handler for rainlang compiler, send the request to server and logs the result in output channel
    async function compileCurrentHandler() {
        if (client && extStatus.active) {
            const expKeys = Array.from((await vscode.window.showInputBox({
                title: "Expression Names",
                placeHolder: "binding-1 binding-2 ...",
                prompt: "specify the expression names in order by a whitespace seperating them"
            })).matchAll(/[^\s]+/g)).map(v => v[0]);
            const result = await vscode.commands.executeCommand(
                "_compile",
                vscode.window.activeTextEditor.document.languageId,
                vscode.window.activeTextEditor.document.uri.toString(),
                expKeys,
                "uri"
                // {
                //     start: vscode.window.activeTextEditor.selection.start,
                //     end: vscode.window.activeTextEditor.selection.end,
                // }
            );
            if (!compilerChannel) compilerChannel = vscode.window.createOutputChannel(
                "Rain Language Compiler",
                "json"
            );
            compilerChannel.show(true);
            if (result) compilerChannel.appendLine(format(
                JSON.stringify(result, null, 2), 
                { parser: "json" }
            ));
            else compilerChannel.appendLine("undefined");
        }
        else vscode.window.showErrorMessage("rain language server is not running!");
    }

    // handler for rainlang compiler by sending the request to server for a mapping
    async function compileAllHandler() {
        if (client && extStatus.active) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            for (const map of compile.onSave) {
                try {
                    const fileContent = (await vscode.workspace.fs.readFile(map.input)).toString();
                    const result = await vscode.commands.executeCommand(
                        "_compile",
                        "rainlang",
                        fileContent,
                        map.entrypoints,
                        "file"
                    );
                    const contents: Uint8Array = Buffer.from(
                        result 
                            ? format(JSON.stringify(result, null, 2), { parser: "json" })
                            : "\"failed to compile!\""
                    );
                    workspaceEdit.createFile(
                        map.output,
                        { overwrite: true, contents }
                    );
                }
                catch { /**/ }
            }
            vscode.workspace.applyEdit(workspaceEdit);
        }
        else vscode.window.showErrorMessage("rain language server is not running!");
    }

    function updateOnSaveCompile() {
        if (extStatus.onsave) extStatus.onsave = false;
        else extStatus.onsave = true;
        updateStatus();
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
            compile.onSave = [];
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
                compile.onSave = [];
            }
            if (extStatus.onsave) {
                const saveMap = compile.onSave.find(v => v.input.toString() === e.uri.toString());
                if (saveMap) {
                    const workspaceEdit = new vscode.WorkspaceEdit();
                    const result = await vscode.commands.executeCommand(
                        "_compile",
                        e.languageId,
                        e.uri.toString(),
                        saveMap.entrypoints,
                        "uri"
                    );
                    const contents: Uint8Array = Buffer.from(
                        result 
                            ? format(JSON.stringify(result, null, 2), { parser: "json" })
                            : "\"failed to compile!\""
                    );
                    workspaceEdit.createFile(
                        saveMap.output,
                        { overwrite: true, contents }
                    );
                    vscode.workspace.applyEdit(workspaceEdit);
                }
            }
        }));

        disposables.push(vscode.workspace.onDidCreateFiles(async created => {
            let didProcessConfig = false;
            if (configUri === undefined && defaultConfigUri1 !== undefined) {
                for (let i = 0; i < created.files.length; i++) {
                    if (created.files[i].toString() === defaultConfigUri1.toString()) {
                        try {
                            configUri = defaultConfigUri1;
                            const content = JSON.parse(
                                (await vscode.workspace.fs.readFile(defaultConfigUri1)).toString()
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                        catch {
                            watched = [];
                            compile.onSave = [];
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                    if (created.files[i].toString() === defaultConfigUri2.toString()) {
                        try {
                            configUri = defaultConfigUri2;
                            const content = JSON.parse(
                                (await vscode.workspace.fs.readFile(defaultConfigUri2)).toString()
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                        catch {
                            watched = [];
                            compile.onSave = [];
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
                            compile.onSave = [];
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
                if(defaultConfigUri1 !== undefined) for(let i = 0; i < renamed.files.length; i++) {
                    try {
                        if (renamed.files[i].newUri.toString() === defaultConfigUri1.toString()) {
                            configUri = defaultConfigUri1;
                            const content = JSON.parse(
                                (await vscode.workspace.fs.readFile(defaultConfigUri1)).toString()
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                        if (renamed.files[i].newUri.toString() === defaultConfigUri2.toString()) {
                            configUri = defaultConfigUri2;
                            const content = JSON.parse(
                                (await vscode.workspace.fs.readFile(defaultConfigUri2)).toString()
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                    }
                    catch { 
                        watched = [];
                        compile.onSave = [];
                        client.sendNotification("unwatch-all");
                        break;
                    }
                }
            }
            else {
                for (let i = 0; i < renamed.files.length; i++) {
                    try {
                        if (renamed.files[i].oldUri.toString() === configUri.toString()) {
                            if(renamed.files[i].newUri.toString() ===defaultConfigUri1?.toString()){
                                configUri = defaultConfigUri1;
                                break;
                            }
                            if(renamed.files[i].newUri.toString() ===defaultConfigUri2?.toString()){
                                configUri = defaultConfigUri2;
                                break;
                            }
                            watched = [];
                            compile.onSave = [];
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
                    defaultConfigUri1 = vscode.Uri.joinPath(workspaceRootUri, defaultConfigPath1);
                    defaultConfigUri2 = vscode.Uri.joinPath(workspaceRootUri, defaultConfigPath2);
                    const isConfig1 = await isConfig(defaultConfigUri1);
                    if (isConfig1) configUri = defaultConfigUri1;
                    else {
                        const isConfig2 = await isConfig(defaultConfigUri2);
                        if (isConfig2) configUri = defaultConfigUri2;
                    }
                    const content = JSON.parse(
                        (await vscode.workspace.fs.readFile(configUri)).toString()
                    );
                    processConfig(content);
                }
                catch {
                    watched = [];
                    compile.onSave = [];
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
        if (
            content?.src?.length > 0 && 
            Array.isArray(content.src) && 
            content.src.every((v: any) => 
                typeof v === "object" &&
                v.input !== undefined &&
                v.output !== undefined &&
                v.entrypoints !== undefined &&
                typeof v.input === "string" &&
                typeof v.output === "string" &&
                v.input.endsWith(".rain") &&
                Array.isArray(v.entrypoints) &&
                v.entrypoints.length > 0 &&
                v.entrypoints.every((e: any) => typeof e === "string")
            )
        ) {
            compile.onSave = content.src.map((v: any) => ({
                input: path.isAbsolute(v.input)
                    ? vscode.Uri.parse(v.input)
                    : vscode.Uri.joinPath(workspaceRootUri, v.input),
                output: path.isAbsolute(v.input)
                    ? vscode.Uri.parse(v.output)
                    : vscode.Uri.joinPath(
                        workspaceRootUri, 
                        v.output.endsWith(".json") ? v.output : v.output + ".json"
                    ),
                entrypoints: v.entrypoints
            }));
            for (const {input} of compile.onSave) {
                promiseGroup1.push(vscode.workspace.fs.stat(input).then(stat => {
                    if (stat.type === vscode.FileType.File) {
                        promiseGroup3.push(vscode.workspace.fs.readFile(input).then(
                            v => client.sendNotification(
                                "watch-dotrain", 
                                [input.toString(), v.toString()]
                            ),
                            () => { /**/ }
                        ));
                    }
                }));
                newWatched.push(input);
            }
        }

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

function hexlify(data: Uint8Array): string {
    let result = "0x";
    for (let i = 0; i < data.length; i++) {
        result += data[i].toString(16);
    }
    return result;
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

// update meta store
async function updateMetaStore(content: any, workspaceRootUri: vscode.Uri): Promise<void> {
    const meta = [];
    const nohash = [];
    const subgraphs = [];
    if (content.subgraphs) {
        if (
            Array.isArray(content.subgraphs) && 
            content.subgraphs.every((v: any) => typeof v === "string")
        ) subgraphs.push(...content.subgraphs);
    }
    if (typeof content?.meta === "object") {
        if (content.meta.binary) {
            if (
                Array.isArray(content.meta.binary) && 
                content.meta.binary.every((v: any) => 
                    typeof v === "string" ||
                    ( 
                        typeof v === "object" &&
                        v.path !== undefined &&
                        v.hash !== undefined &&
                        typeof v.path === "string" &&
                        typeof v.hash === "string" &&
                        /^0x[a-zA-F0-9]{64}$/.test(v.hash)
                    )
                )
            ) {
                for (const p of content.meta.binary) {
                    const uri = typeof p === "string"
                        ? path.isAbsolute(p)
                            ? vscode.Uri.parse(p)
                            : vscode.Uri.joinPath(workspaceRootUri, p)
                        : path.isAbsolute(p.path)
                            ? vscode.Uri.parse(p.path)
                            : vscode.Uri.joinPath(workspaceRootUri, p.path);
                    try {
                        const d = hexlify(await vscode.workspace.fs.readFile(uri));
                        if (typeof p === "string") nohash.push(d);
                        else meta.push([p.hash, d]);
                    }
                    catch { /**/ }
                }
            }
        }
        if (content.meta.hex) {
            if (
                Array.isArray(content.meta.hex) && 
                content.meta.hex.every((v: any) => 
                    typeof v === "string" ||
                    ( 
                        typeof v === "object" &&
                        v.path !== undefined &&
                        v.hash !== undefined &&
                        typeof v.path === "string" &&
                        typeof v.hash === "string" &&
                        /^0x[a-zA-F0-9]{64}$/.test(v.hash)
                    )
                )
            ) {
                for (const p of content.meta.hex) {
                    const uri = typeof p === "string"
                        ? path.isAbsolute(p)
                            ? vscode.Uri.parse(p)
                            : vscode.Uri.joinPath(workspaceRootUri, p)
                        : path.isAbsolute(p.path)
                            ? vscode.Uri.parse(p.path)
                            : vscode.Uri.joinPath(workspaceRootUri, p.path);
                    try {
                        const d = (await vscode.workspace.fs.readFile(uri)).toString();
                        if (typeof p === "string") nohash.push(d);
                        else meta.push([p.hash, d]);
                    }
                    catch { /**/ }
                }
            }
        }
    }
    client.sendNotification("update-meta-store", [subgraphs, nohash, meta]);
}
