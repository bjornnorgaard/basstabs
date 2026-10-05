export const EXAMPLE_SOURCE = `[C Major Scale]
# Square brackets name a section. Headings and # comments need their own lines.
# Use comments for playing directions or lyrics; they are not played.
# Ascending C major: C D E F G A B C.
|A3 5 D2 3 5 G2 4 5|

[Strings and Frets]
# A3 means fret 3 on the A string. A bare number stays on the previous string.
# Fret 0 is an open string. String names ignore case: E0 and e0 mean the same note.
# Choose 4-, 5-, or 6-string tuning above; B and C strings need the matching tuning.
|E0 3 5 A0 2 D0 G0|

[Spacing and Silence]
# Each fret digit and space occupies one tab column; string names occupy none.
# Spaces create visual gaps, not timed rests. Trailing spaces extend the bar.
# A bar containing only spaces is silent during playback.
|E1 2 3 4|E1  2  3  4  |    |

[Joined Notes]
# A2E320 means A2 E3 2 0: adjacent notes form a quick run during playback.
# Every unbracketed digit is a separate fret: E12 means E1 E2.
# These bars have the same pitches, but different spacing and playback grouping.
|A2E320|A2 E3 2 0|

[Higher Frets]
# Brackets make a multi-digit fret: D[10] means fret 10, not frets 1 and 0.
# E[12]3 joins fret 12 to fret 3; E123 joins frets 1, 2, and 3.
# A bracketed fret without a string reuses the previous string: [12] after D[10].
# A whole line like [12] is a section heading; use |[12]| for a lone bare fret.
|D[10] [12] G[12] [14]|E[12]3|E123|

[Articulations]
# Conventional tab marks are supported: h, p, /, \\, b, ~, x, and ghost notes.
# Connectors such as E5h7 render as 5h7; each articulation character is a column.
# Playback treats connected and ghost notes as plain notes for now; x is silent.
|E5h7 E7p5|A3/5 D5\\3|G5b G5~|Ex E(5)|

[Bar Lines and Rows]
# The | character separates measures (bars); their written widths can differ.
# Playback gives each bar four beats at the chosen BPM, regardless of its width.
# Note groups divide that time evenly; the syntax does not specify note durations.
|E0A2|E0 0 3 A2|A3 3 3 3  |A2E320    |

# Newlines start a new row of tab.
# Bare frets still use the previous string (E here). A final | is optional.
3 2 0

[Verse]
# Original lyric sketch: Footsteps settle into time
# Let the low notes trace the line
# Lyrics appear above the row; words are not aligned to individual notes.
|E0 0 A2 2 |E0 0 3 A2|A3 3 3 3 |A2E320    |

[Try the Features]
# Use Play all, or hover a section, row, or bar and click its play button.
# Shift+click loops a selection; the Loop button makes looping the default.
# Colours match the editor to the tab. Place the caret on a note to outline it.
# Click Shorthand editor to collapse it and focus on the tab.
# Copy tab, download .txt, or Share link to keep the headings and comments.
# Tabs save automatically in this browser. Sound design in the header shapes the bass.`;
