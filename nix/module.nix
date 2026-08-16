# NixOS module: a oneshot service plus the timer that fires it.
#
# Imported as `inputs.offer-adder.nixosModules.default`; see
# /docs/DEPLOYMENT.md for a worked example and for the secrets handling.
self: {
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.offer-adder;
  stateDir = "/var/lib/offer-adder";
  # Anchor the two state directories in the service's StateDirectory rather
  # than letting the app's `~/.local/state` default resolve against the service
  # user's home. `settings` wins if it names them explicitly.
  settingsFile =
    (pkgs.formats.json {}).generate "offers.config.json"
    ({
        artifactDir = "${stateDir}/artifacts";
        profileDir = "${stateDir}/profiles";
      }
      // cfg.settings);
  # Either way systemd stages the document in $CREDENTIALS_DIRECTORY — a
  # per-unit tmpfs, mode 0400, owned by the service user and torn down when the
  # run ends — under the name the app looks for, so nothing has to name a path.
  credentialName = "offers-credentials";
  credentialOption =
    if cfg.sealed
    then {LoadCredentialEncrypted = "${credentialName}:${toString cfg.credentialFile}";}
    else {LoadCredential = "${credentialName}:${toString cfg.credentialFile}";};
in {
  options.services.offer-adder = {
    enable = lib.mkEnableOption "the credit card offer adder";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = lib.literalExpression "offer-adder.packages.\${system}.default";
      description = "The offer-adder package to run.";
    };

    settings = lib.mkOption {
      type = (pkgs.formats.json {}).type;
      example = lib.literalExpression ''
        {
          accounts = [
            {
              id = "connor-amex";
              label = "Connor · Amex";
              issuer = "amex";
              codeSources = ["totp" "prompt"];
              senderHints = ["americanexpress"];
            }
          ];
        }
      '';
      description = ''
        The contents of offers.config.json. Rendered into the world-readable
        Nix store, which is safe because the schema holds no secrets at all —
        every password, TOTP secret and token lives in `credentialFile`
        instead. See the `@offers/config` README for every field.
      '';
    };

    credentialFile = lib.mkOption {
      type = lib.types.path;
      example = "/var/lib/secrets/offer-adder/credentials.cred";
      description = ''
        The credentials document — bank logins, TOTP secrets, mailbox logins,
        ntfy token. systemd loads it at unit start into a private tmpfs, mode
        0400, that only this service can read and that is unmounted when the
        run ends, so it never reaches the process environment and never appears
        in `systemctl show`.

        Sealed by default; see `sealed` below. Seal it with

          systemd-creds encrypt --with-key=host+tpm2 \
            --name=offers-credentials credentials.json credentials.cred

        Must NOT be a store path, which is world-readable. See
        /docs/DEPLOYMENT.md for the full procedure and for the agenix and
        sops-nix alternatives.
      '';
    };

    sealed = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Whether `credentialFile` is `systemd-creds encrypt` output
        (`LoadCredentialEncrypted`) rather than the plaintext document
        (`LoadCredential`). Set this false when another secret manager —
        agenix, sops-nix — already decrypts the file for you; systemd still
        gives the tmpfs isolation either way, but the TPM binding is yours to
        replace.
      '';
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "offer-adder";
      description = ''
        User the run executes as. Its state directory holds the per-account
        browser profiles, which are what keep the banks from challenging every
        login, so it must be a stable account with durable storage.
      '';
    };

    onCalendar = lib.mkOption {
      type = lib.types.str;
      default = "*-*-* 03:17,15:17:00";
      description = ''
        When to run, in systemd calendar format. Twice a day catches new offers
        sooner than daily, and a run with nothing to add costs a couple of
        minutes. Deliberately off the hour — a login at 03:00:00 sharp is a bot
        signature.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    # A store path is world-readable, so a credentials file placed there would
    # be readable by every user on the machine. Caught here rather than at run
    # time because by then the secret has already been published.
    assertions = [
      {
        assertion = !(lib.hasPrefix builtins.storeDir (toString cfg.credentialFile));
        message = ''
          services.offer-adder.credentialFile points into the Nix store
          (${toString cfg.credentialFile}), which is world-readable. Seal the
          credentials with `systemd-creds encrypt` and reference the resulting
          file by an absolute path outside the store.
        '';
      }
    ];

    users.users.${cfg.user} = lib.mkIf (cfg.user == "offer-adder") {
      isSystemUser = true;
      group = "offer-adder";
      home = stateDir;
      description = "Credit card offer adder";
    };
    users.groups.offer-adder = lib.mkIf (cfg.user == "offer-adder") {};

    systemd.services.offer-adder = {
      description = "Add every available card offer to the configured accounts";
      after = ["network-online.target"];
      wants = ["network-online.target"];

      environment = {
        HOME = stateDir;
        OFFERS_CONFIG = settingsFile;
      };

      serviceConfig = credentialOption // {
        Type = "oneshot";
        User = cfg.user;
        StateDirectory = "offer-adder";
        WorkingDirectory = stateDir;
        # A run is a few minutes. Longer means something is hung on a bank page,
        # and the next firing is a better bet than waiting.
        TimeoutStartSec = "30min";
        NoNewPrivileges = true;
        PrivateTmp = true;
      };

      # Xvfb rather than headless Chromium: a headless browser is the easiest
      # thing for a bank to fingerprint, and being fingerprinted means a
      # challenge on every run — the one thing this design cannot absorb.
      script = ''
        exec ${lib.getExe pkgs.xvfb-run} --auto-servernum \
          --server-args="-screen 0 1440x900x24" \
          ${lib.getExe cfg.package}
      '';
    };

    systemd.timers.offer-adder = {
      description = "Add new card offers twice a day";
      wantedBy = ["timers.target"];
      timerConfig = {
        OnCalendar = cfg.onCalendar;
        RandomizedDelaySec = "45min";
        Persistent = true;
      };
    };
  };
}
