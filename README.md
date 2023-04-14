# Rain Language Implementation for Visual Studio Code

Rain language implementation for vscode. Uses Rain Language Services from [rainlang](https://github.com/rainprotocol/rainlang) repo under the hood.
It has the following language features:
- Completions
- Diagnostics
- Hovers

It also includes an End-to-End test.
<br>

## Functionality

Rain Language Server works for rain files with `.rain`, `.rainlang` or `.rl` extentions as well as syntax highlighting for javascript/typescript [Tagged Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) with using `rainlang()` as a tagged template literal function, example:
```typescript
// rainlang function is part of rainlang API, see: https://github.com/rainprotocol/rainlang
const myExp = rainlang`_: add(1 2);`
```
<br>

## Tutorial

### Configuring Op Meta

After installing the extention from vscode marketplace, if `.vscode/settings.json` does not already exists in your workspace, create it and add either of the following property:<br>
- full op meta bytes as hex string:
```json
{
  "rainlang.opmeta": "0x123abcd...   // op meta compressed bytes in hex string"
}
```
- deployer address and subgraph api endpoint url:
```json
{
  "rainlang.opmeta": {
    "deployerAddress": "0x12345...",
    "source": "https://api.thegraph.com/..." 
  }
}
``` 
- deployer address and network name:
```json
{
  "rainlang.opmeta": {
    "deployerAddress": "0x12345...",
    "source": "mumbai"
  }
}
```
- deployer address and chain id:
```json
{
  "rainlang.opmeta": {
    "deployerAddress": "0x12345...",
    "source": 137
  }
}
```
<br>

`deployerAddress` is the address of the ExpressionDeployer contract.
`source` can be either an evm network name or chain id or a subgraph api endpoint url.
<br>

### Compilation

Use `Rainlang Compile` command accessible from Command Palette or from editor's context menu (right-click) to compile the selected rainlang document and get the ExpressionConfig.
<br>

## Developers Guide

- Clone the repo and open VS Code on this folder.
- Run `npm install` in this folder or `nix-shell` if you have nix installed on your machine. This installs all necessary npm modules in both the client and server folder
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client Desktop` for desktop mode or `Launch Client Web` for browser mode from the drop down (if it is not already).
- Press ▷ to run the launch config (F5) which will open a new instance of vscode called [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.).
- The [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, will open a pre configured workspace (the `./workspace-dev` folder from root of this repo), you can configure `.vscode/settings.json` to set the `opmeta` as explained above in Tutorial section.
- Start editing the `test.rain` file.
- Alternatively create a document that ends with `.rain` to start the language mode for that.
  - Start typing your expression and get the completion for opcodes.
  - Hover over some of the opcodes or values to get hover items.
  - The diagnostics will be generated automatically.
<br>

## Structure
```
.
├──── client                                    // Rain Language Client
│     ├──── src
│     │     ├──── nodeClient.ts                 // Desktop extension client entry point
│     │     └──── browserClient.ts              // Web extention client entry point
├──── server                                    // Rain Language Server
│     ├──── src
│     │     ├──── nodeServer.ts                 // Desktop extension server entry point
│     │     └──── browserServer.ts              // Web extension server entry point
├──── syntaxes                                  // Rain language syntaxes
│     ├──── rainlang-syntax.json                // Rainlang syntaxes
│     ├──── rainlang-injection.json             // Rainlang injection syntaxes for inline typescript and javascript
├──── test                                      // End to End tests for Language Client / Server
│     ├──── web
│     │     ├──── index.ts                      // Web extension test entry point
│     │     └──── runTest.ts                    // Web extention e2e test runner
│     ├──── desktop
│     │     ├──── index.ts                      // Desktop extention test entry point
│     │     └──── runTest.ts                    // Desktop extention e2e test runner
├──── docs                                      // Documents (images, icons, ...)
├──── workspace-dev                             // Extension Development Host workspace
├──── package.json                              // The extension manifest
├──── rain-language-configuration.json          // Rain language configurations
└──── shell.nix                                 // Nix shell configuration
```
