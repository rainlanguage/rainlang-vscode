/**@type {import('eslint').Linter.Config} */
// eslint-disable-next-line no-undef
module.exports = {
    root: true,
    env: {
        "browser": true,
        "es2021": true,
        "node": true,
        "commonjs": true
    },
    parser: "@typescript-eslint/parser",
    plugins: [ "@typescript-eslint" ],
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    rules: {
        "semi": [2, "always"],
        "quotes": ["error", "double"],
        "indent": [
            "error",
            4,
            { 
                "VariableDeclarator": "first",
                "flatTernaryExpressions": true,
                "offsetTernaryExpressions": false
            }
        ],
        "max-len": [
            "error",
            { 
                "code": 100,
                "ignoreStrings": true,
                "ignoreComments": true,
                "ignoreTemplateLiterals": true
            }
        ],
        "no-cond-assign": 0,
        "no-irregular-whitespace": 0,
        "@typescript-eslint/no-unused-vars": 0,
        "@typescript-eslint/no-explicit-any": 0,
        "@typescript-eslint/explicit-module-boundary-types": 0,
        "@typescript-eslint/no-non-null-assertion": 0
    }
};