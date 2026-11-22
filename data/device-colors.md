# Device colours

The `finishes` on each device in `devices.json` are the maker's official colours, listed darkest
first. The first one is the default. Names come from official pages. Colour values were
measured from official images unless a device is listed under "Not measured" below.

## Sources

| Devices                 | Names                                            | Colour values                                                                  |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| iPhone                  | Apple support, "Identify your iPhone model"      | apple.com iPhone compare page product images (back = swatch, front edge = rim) |
| iPad mini, iPad Pro     | Apple tech specs pages                           | apple.com iPad compare page product images                                     |
| MacBook Air 13          | Apple support, "Identify your MacBook Air model" | Apple bezel artwork (lid edge and keyboard deck)                               |
| Pixel                   | Google Pixel tech specs                          | Google Store colour chips (current pages and Wayback Machine copies)           |
| Galaxy S26, S26 Ultra   | samsung.com spec pages                           | samsung.com colour chip images                                                 |
| Galaxy A55              | samsung.com                                      | Samsung's four-colour lineup image                                             |
| Galaxy A51/71           | Samsung Newsroom                                 | Newsroom press photos                                                          |
| Galaxy Z Fold6, Z Fold5 | Samsung Newsroom                                 | samsung.com colour images and chips (Wayback copies)                           |
| Galaxy S20 Ultra, S8+   | Samsung Newsroom                                 | fastlane per-colour device frames                                              |
| Galaxy Tab S4           | samsung.com                                      | Samsung US product gallery back shots (Wayback copies)                         |
| Moto G4                 | Motorola support specs                           | Motorola 2016 product image                                                    |
| Surface Duo             | Microsoft support specs                          | Microsoft hinge close-up image                                                 |
| Nest Hub Max            | Google device specs                              | Google Store colour chips (fabric base)                                        |

The rim tones are derived from the swatch when only the swatch could be measured. That covers
Pixel, Galaxy S26, A-series, Fold5, Tab S4, iPad Pro, Moto G4 and Surface Duo.

## Not measured: one official colour, using the frame's own values

No usable official image was found for these devices, so each shows one correct official colour.
The colour values are the device frame's existing rim colours.

| Device               | Colour shown                                                | Other official colours                                                                |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Surface Pro 7        | Platinum                                                    | Matte Black. Only angled lifestyle photos exist, and their lighting skews the colour. |
| Surface Pro 10       | Black (same design as the measured Surface Pro X Black art) | Platinum                                                                              |
| Asus Zenbook 17 Fold | Tech Black (its only colour)                                | none                                                                                  |
| JioPhone 2           | Black (its only colour)                                     | none                                                                                  |
| Moto G Power         | Dark Grove (2022 model)                                     | Ice Blue. The preset's model year is unclear.                                         |

## Missing official colours

These colours exist, but no official image was found, so they are left out:

- Moto G4: White (it also has a white front)
- Galaxy A51: Prism Crush Pink (regional)
- Galaxy Z Fold5: Blue and Gray (Samsung.com exclusives)
- Surface Pro 7: Matte Black
- Surface Pro 10: Platinum
- Moto G Power: Ice Blue

## Generic devices

Facebook on Android, the three generic laptops, Full HD Desktop and custom devices are not real
products. They use the neutral set: Black, Silver, Space Gray (`GENERIC_FINISHES` in
`lib/devices.ts`).
