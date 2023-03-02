let
	pkgs = import
		(builtins.fetchTarball {
			name = "nixos-unstable-2022-09-26";
			url = "https://github.com/nixos/nixpkgs/archive/b8e83fd7e16529ee331313993508c3bf918f1d57.tar.gz";
			sha256 = "1a98pgnhdhyg66176i36rcn3rklihy36y9z4176la7pxlzm4khwf";
		})
		{ };

	local-test = pkgs.writeShellScriptBin "local-test" ''
		npm run test
	'';

	flush-all = pkgs.writeShellScriptBin "flush-all" ''
		rm -rf server/out
		rm -rf server/node_modules
		rm -rf client/out
		rm -rf client/node_modules
		rm -rf node_modules
	'';

	ci-test = pkgs.writeShellScriptBin "ci-test" ''
		flush-all
		npm install
		build
		local-test
	'';

	build = pkgs.writeShellScriptBin "build" ''
		npm run compile
	'';

	build-all = pkgs.writeShellScriptBin "build-all" ''
		flush-all
		npm install
		build
	'';

	watch = pkgs.writeShellScriptBin "watch" ''
		npm run watch
	'';

	lint = pkgs.writeShellScriptBin "lint" ''
		npm run lint
	'';

	in
	pkgs.stdenv.mkDerivation {
		name = "shell";
		buildInputs = [
			pkgs.nixpkgs-fmt
			pkgs.nodejs-16_x
			build
			build-all
			local-test
			ci-test
			flush-all
			watch
			lint
		];

		shellHook = ''
			export PATH=$( npm bin ):$PATH
			# keep it fresh
			npm install
		'';
	}
