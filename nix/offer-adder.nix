# The offer adder as a Nix package.
#
# There is no build step — bun runs the TypeScript directly — so this only has
# to resolve dependencies offline and wrap an entry point that can find them.
{
  lib,
  stdenv,
  bun,
  bun2nix,
  playwright-driver,
  makeWrapper,
  runCommandLocal,
  xvfb-run,
  src,
}: let
  buildSrc = lib.cleanSourceWith {
    inherit src;
    filter = path: _:
      !(builtins.elem (baseNameOf (toString path)) [
        "node_modules"
        ".direnv"
        ".turbo"
        ".profiles"
        ".artifacts"
      ]);
  };

  # bun2nix's per-package fetch expressions are generated here at build time via
  # IFD rather than committed, so there is no large generated file to keep in
  # sync with bun.lock. bun2nix is a pure function of bun.lock, so this is
  # deterministic. It runs inside a copy of the source because the generated
  # file references workspace packages by relative path (`copyPathToStore
  # ./apps/*`, `./packages/*`), which must resolve where it is imported.
  generatedBunDeps = runCommandLocal "offer-adder-bun-deps-nix" {} ''
    cp -r ${buildSrc} $out
    chmod -R u+w $out
    ( cd $out && ${lib.getExe bun2nix} -o bun.generated.nix )
  '';
in
  stdenv.mkDerivation {
    pname = "offer-adder";
    version = "0.0.0";
    src = buildSrc;

    nativeBuildInputs = [bun makeWrapper bun2nix.hook];

    # Each dependency is fetched as its own content-addressed derivation with a
    # hash read from bun.lock's integrity field, so there is no node_modules FOD
    # whose hash drifts between platforms.
    bunDeps = bun2nix.fetchBunDeps {
      bunNix = "${generatedBunDeps}/bun.generated.nix";
    };

    # The hook always appends --ignore-scripts, which is what we want here:
    # playwright's postinstall would otherwise try to download a browser we are
    # taking from nixpkgs instead.
    bunInstallFlags = ["--linker=isolated" "--offline"];
    dontRunLifecycleScripts = true;
    dontUseBunCheck = true;
    dontConfigure = true;
    dontBuild = true;

    doCheck = true;
    checkPhase = ''
      runHook preCheck
      export HOME=$(mktemp -d)
      bun test
      runHook postCheck
    '';

    meta = {
      description = "Adds every available Amex and Chase offer to your cards on a schedule";
      homepage = "https://github.com/cprussin/credit-card-offer-adder";
      mainProgram = "offer-adder";
      platforms = lib.platforms.linux;
    };

    installPhase = ''
      runHook preInstall

      mkdir -p "$out/share/offer-adder"
      cp -a . "$out/share/offer-adder/"

      # bun resolves node_modules by walking up from the script, so the entry
      # point has to stay inside the copied workspace rather than being linked
      # into $out/bin.
      makeWrapper ${lib.getExe bun} "$out/bin/offer-adder" \
        --add-flags "$out/share/offer-adder/apps/offer-adder/src/main.ts" \
        --set PLAYWRIGHT_BROWSERS_PATH "${playwright-driver.browsers}" \
        --set PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS "true" \
        --prefix PATH : ${lib.makeBinPath [xvfb-run]}

      runHook postInstall
    '';
  }
