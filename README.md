# Rain Language Support for Visual Studio Code (vscode extention)

Rain language support for vscode. Uses Rain Language Services from [rainlang](https://github.com/rainprotocol/rainlang) repo under the hood.
<br>

## Functionality

Rain Language Server works for rain files with `.rain`, `.rainlang` or `.rl` extentions and also syntax highlighting for javascript/typescript [Tagged Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates), example:
```typescript
// rainlang function is part of rainlang API, see: https://github.com/rainprotocol/rainlang
const myExp = rainlang`_: add(1 2);`
```
<br>

It has the following language features:
- Completions
- Diagnostics
- Hovers

It also includes an End-to-End test.
<br>

## Tutorial

### Configuring Op Meta

After installing the extention from vscode marketplace, if `.vscode/settings.json` does not already exists in your workspace, create it and add the following property:
```json
"rainlang.opmeta": "0x123abcd...   // op meta compressed bytes in hex string"
```
or
```json
"rainlang.opmeta": {
  "deployerAddress": "0x12345...",
  "source": {
    "subgraphUrl": "https://api.thegraph.com/..." 
  }
}
``` 
or
```json
"rainlang.opmeta": {
  "deployerAddress": "0x12345...",
  "source": {
    "chainId": 524289
  }
}
```
- `524289` is Mumbai (Polygon testnet) chain id.
- if no `chainId` or `subgraphUrl` are provided, the default Mumbai subgraph will be used and if both are provided, subgraph URL will be prioritized.
<br>

### Compilation

Use [Rainlang Compile]() command accessible from Command Palette or from editor's context menu (right-click) to compile the selected rainlang document and get the ExpressionConfig.
<br>

## Developers Guide

- Clone the repo and open VS Code on this folder.
- Run `npm install` in this folder or `nix-shell` if you have nix installed on your machine. This installs all necessary npm modules in both the client and server folder
- Switch to the Run and Debug View in the Sidebar (Ctrl+Shift+D).
- Select `Launch Client` from the drop down (if it is not already).
- Press ▷ to run the launch config (F5) which will open a new instance of vscode called [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.).
- In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open or create a new workscpace and then create `.vscode/settings.json` and set the `opmeta` as explained above in Tutorial section.
- Create a document that ends with `.rain` to start the language mode for that. (save this workspace to have them ready for future).
  - Start typing your expression and get the completion for opcodes.
  - Hover over some of the opcodes or values to get hover items.
  - The diagnostics will be generated automatically.
<br>

## Structure

```
.
├── client // Rain Language Client
│   ├── src
│   │   ├── test // End to End tests for Language Client / Server
│   │   └── extension.ts // Language Client entry point
├── package.json // The extension manifest.
└── server // Rain Language Server
    └── src
        └── server.ts // Language Server entry point
```
<br>
