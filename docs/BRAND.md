# 守織 SHUORI · visual identity

The application name is **守織 SHUORI**. The characters lead the wordmark; SHUORI provides a consistent Latin spelling. The rest of the interface remains English, as requested.

The original woven symbol suggests individual contributions crossing to form a supportive whole. It is a new application mark, distinct from the hospital's own communication mark.

## Color reference

The University of Tokyo Hospital's [communication-mark page](https://www.h.u-tokyo.ac.jp/about/mark/) and its linked [published mark image](https://www.h.u-tokyo.ac.jp/about/mark/images/index_img01.jpg) were inspected on 8 October 2026. The dominant flat aqua pixels in that JPEG sample are RGB **0, 167, 203** (`#00A7CB`). This is a measured reference from a public raster image, not a claim that an official brand manual specifies that exact value.

| Use | Color |
| --- | --- |
| Hospital-inspired aqua accent | `#00A7CB` |
| Primary controls and strong blue text | `#176B91` / `#006B88` |
| Pale aqua surface | `#E6F7FB` |
| Cool white canvas | `#F4FAFD` |

Pale shades are used for backgrounds and selected states. Stronger blue is used where text and controls need contrast. Warning, error and status colors retain their meanings. The 3D scene uses cooler clinical surfaces and upholstery while keeping natural wood and plant colors and distinct building-zone tints.

The hospital's logo image is used only as a local design reference and is not redistributed in the release. The application does not represent hospital endorsement. Public source links remain available in the source documentation.

## Upgrade compatibility

The visible name, browser title, logo, launcher, download names and new exported documents use SHUORI. Existing databases, record IDs, sessions and Docker volume identifiers remain stable. Earlier `komorebi-scene` files and `komorebi-backup` snapshots remain readable; new exports use `shuori-scene` and `shuori-backup`. Existing browser scene drafts can be recovered from the earlier storage key. Calendar event identifiers remain stable to prevent duplicate events when an existing calendar is updated.

`Start-SHUORI.cmd` is the main Windows launcher. `Start-Komorebi.cmd` remains as a small compatibility launcher for existing shortcuts.
