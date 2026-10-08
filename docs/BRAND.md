# 守織 SHUORI · visual identity

The application name is **守織 SHUORI**. The characters lead the wordmark; SHUORI provides a consistent Latin spelling. The rest of the interface remains English, as requested.

The original woven symbol suggests individual contributions crossing to form a supportive whole. It identifies this independently developed personal project and does not represent any hospital, university or other organization.

## SHUORI palette

SHUORI uses an aqua and pale-blue interface palette. These values specify the application's current presentation; they are not an institutional brand specification or evidence of endorsement.

| Use | Color |
| --- | --- |
| SHUORI aqua accent | `#00A7CB` |
| Primary controls and strong blue text | `#176B91` / `#006B88` |
| Pale aqua surface | `#E6F7FB` |
| Cool white canvas | `#F4FAFD` |

Pale shades are used for backgrounds and selected states. Stronger blue is used where text and controls need contrast. Warning, error and status colors retain their meanings. The 3D scene uses cooler clinical surfaces and upholstery while keeping natural wood and plant colors and distinct building-zone tints.

No external organization's logo or communication mark is bundled. The example floor model's separate source attribution is documented in [Floor sources](FLOOR-SOURCES.md); those references are not part of SHUORI's identity.

## Upgrade compatibility

The visible name, browser title, logo, launcher, download names and new exported documents use SHUORI. Existing databases, record IDs, sessions and Docker volume identifiers remain stable. Earlier `komorebi-scene` files and `komorebi-backup` snapshots remain readable; new exports use `shuori-scene` and `shuori-backup`. Existing browser scene drafts can be recovered from the earlier storage key. Calendar event identifiers remain stable to prevent duplicate events when an existing calendar is updated.

`Start-SHUORI.cmd` is the main Windows launcher. `Start-Komorebi.cmd` remains as a small compatibility launcher for existing shortcuts.
