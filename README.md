# Emissions dashboard
Noah Zuijderwijk
Data Management and Visualisation, University of Amsterdam November 2026

This repository contains an app that generates a visual datastory about global CO2 emissions and compares total emissions to emissions per person over time from 1990-2024. The raw data are stored in Data_vis/data/. This data is processed by the build_data.py script, which outputs the data.js file in the js/ folder. This folder contains the javascript that interacts with the js/data.js file upon which the app is built. The js/ folder also contains the javascript required to run the interactive parts of the app. Engine.js contains the geometry and cartogram maths for the figures and views.js contains the js that makes the interactive component of the app smooth. Styles.css contains layout, colours, and formatting information of the page, and index.html contains the web app text.

## Repository structure

```text
Data_vis/
├── data/
│   ├── countries-110m.json
│   ├── world-atlas-LICENSE.txt
│   └── EDGAR_2025_GHG_booklet_2025.xlsx   ← you add this
├── js/   (engine.js, views.js, app.js, and data.js once built)
│   ├── app.js
│   ├── data.js
│   ├── engine.js
│   └── views.js
├── build_data.py
├── index.html
└── styles.css
```