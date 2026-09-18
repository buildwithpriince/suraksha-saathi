# app-unity — Android AR app (Unity 6.3 LTS)

Loaded when working inside `app-unity/`. Root `CLAUDE.md` rules still apply.

## Stack
- Unity 6.3 LTS (6000.3.x), Android build target, IL2CPP, ARM64, min API 29 (Android 10)
- AR Foundation + Google ARCore XR Plugin (plane detection, image tracking, raycasts)
- UI Toolkit (UXML/USS) with Advanced Text Generator enabled; Noto Sans Devanagari dynamic font
- Unity Localization package (locales: `en`, `hi`, `sat`)
- Input System package, Unity Test Framework
- Newtonsoft JSON (`com.unity.nuget.newtonsoft-json`)
- BouncyCastle (Ed25519) and ZXing.Net (QR encode/decode) as DLLs in `Assets/Plugins/`
- Local storage: SQLite (see `docs/DECISIONS.md` D-004 for the chosen package)

## Folder layout (create exactly this)
```
Assets/_Project/
  Scripts/
    Core/        # pure C#, asmdef SurakshaSaathi.Core, "No Engine References" = ON
      Scenarios/     # scenario model + JSON loading
      Assessment/    # event log, rule evaluation, scoring (docs/03)
      Certificates/  # payload build, sign, verify (docs/04)
      Sync/          # DTOs matching docs/06
    Runtime/     # asmdef SurakshaSaathi.Runtime -> refs Core, AR Foundation, Localization
      AR/            # session, availability check, placement, image tracking
      Scenario/      # ScenarioPlayer: drives a scenario, emits events to Core
      Interactions/  # tap targets, drag, extinguisher aim, PPE rack
      Fallback/      # tabletop 3D mode for non-ARCore phones
      Persistence/   # SQLite repositories, outbox
      Net/           # sync client (UnityWebRequest)
      UI/            # UI Toolkit controllers, one per screen
      Localization/  # key helpers, audio narration player
    Editor/      # asmdef Editor-only: content import, build helpers
  Scenes/        # Boot, Home, ARTraining, TabletopTraining, Verify
  Prefabs/  Art/  Audio/  UI/ (uxml, uss)  Markers/  Localization/
  Tests/EditMode/  Tests/PlayMode/
Assets/StreamingAssets/content/   # copied from /content by Editor script; never edit here
CoreTests~/                       # .NET 8 xUnit project compiling Scripts/Core (Unity ignores ~ folders)
```

## Rules for code here
- Core must not reference `UnityEngine`. Anything testable (scoring, crypto, parsing, sync DTOs)
  goes in Core so it runs under `dotnet test`. Keep Core at C# 9 (Unity's language level).
- Runtime MonoBehaviours stay thin: read input, call Core, render result.
- One `ScenarioPlayer` plays any scenario from JSON. Never write module-specific step logic in
  C#; add a generic interaction type instead (see `docs/02-AR-MODULES.md` "Interaction types").
- Always check AR availability (`ARSession.CheckAvailability`) on boot. Unsupported -> load
  `TabletopTraining` with the same scenario and the same scoring.
- No `FindObjectOfType` / `GameObject.Find` in gameplay code; inject via serialized references.
- No allocations in `Update` on hot paths; mid-range phones are the target.
- Timestamps: use a monotonic clock for step timing, UTC unix seconds for records.
- New UI text: add the key to the string table spec in `docs/07-LOCALIZATION.md` first.

## Unity Editor work (scenes, prefabs, settings)
- Use Unity MCP tools when connected (`/mcp` shows status). Before changing a scene, read its
  hierarchy. After changes, read the Console and report errors.
- If MCP is not connected, do not guess YAML. Output numbered Editor steps for the human.

## Commands
- Core tests: `dotnet test CoreTests~` (run after every Core change)
- EditMode tests (Editor must be CLOSED for this project):
  `<UNITY_PATH> -batchmode -projectPath . -runTests -testPlatform EditMode -testResults ./TestResults/editmode.xml -logFile -`
- Android build is done by a human from the Editor (File > Build Profiles). Do not attempt CLI builds.

## Known gotchas
- TextMeshPro cannot shape Devanagari. UI Toolkit + Advanced Text Generator + dynamic font only.
- ARCore image tracking needs markers with high-contrast, non-repeating detail. Use the
  generated markers in `Assets/_Project/Markers/`, and set their physical width in the library.
- Batchmode tests fail if the Editor has the same project open (project lock).
