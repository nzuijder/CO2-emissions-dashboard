# Emissions dashboard
Noah Zuijderwijk
Data Management and Visualisation, University of Amsterdam November 2026

This repository contains an app that generates a visual datastory about global CO2 emissions and compares total emissions to emissions per person over time from 1990-2024. The raw data are stored in Data_vis/data/. Global emissions data (EDGAR 2025 greenhouse gas booklet) is taken from https://edgar.jrc.ec.europa.eu/report_2025. 

This data is preprocessed by the build_data.py script, which outputs the data.js file in the js/ folder. This folder contains the javascript that interacts with the js/data.js file upon which the app is built. The js/ folder also contains the javascript required to run the interactive parts of the app. Engine.js contains the geometry and cartogram maths for the figures and views.js contains the js that makes the interactive component of the app smooth. Styles.css contains layout, colours, and formatting information of the page, and index.html contains the web app text.

The website can be accessed at: https://co2-emissions-dashboard-eight.vercel.app/ 

## Repository structure

```text
Data_vis/
├── data/
│   ├── countries-110m.json
│   ├── world-atlas-LICENSE.txt
│   └── EDGAR_2025_GHG_booklet_2025.xlsx
├── js/
│   ├── app.js
│   ├── data.js
│   ├── engine.js
│   └── views.js
├── build_data.py
├── index.html
└── styles.css
```

## How to rebuild `data.js`
 
`scripts/build_data.py` reads the workbook and the world atlas topology and writes `data.json`.
 
```bash
pip install pandas openpyxl pycountry
npm install world-atlas
python3 scripts/build_data.py
```
## Data license information

©European Union 2025, European Commission, Joint Research Centre (JRC), EDGAR (Emissions Database for Global Atmospheric Research) Community GHG database, comprising IEA-EDGAR CO2, EDGAR CH4, EDGAR N2O and EDGAR F-gases version EDGAR_2025_GHG (2025). Unless otherwise noted, all material owned by the European Union is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. This means that reuse is allowed, provided that appropriate credit is given and any changes are indicated.

All emissions, except for CO2 emissions from fuel combustion, are from the EDGAR (Emissions Database for Global Atmospheric Research) Community GHG database comprising IEA-EDGAR CO2, EDGAR CH4, EDGAR N2O and EDGAR F-gases version EDGAR_2025_GHG (2025).

IEA-EDGAR CO2, a component of the EDGAR (Emissions Database for Global Atmospheric Research) Community GHG database version EDGAR_2025_GHG (2025) including or based on data from IEA (2024) Greenhouse Gas Emissions from Energy, www.iea.org/data-and-statistics, as modified by the Joint Research Centre.

IEA-EDGAR CO2 (v4) data are based on data from IEA (2024) Greenhouse Gas Emissions from Energy, www.iea.org/data-and-statistics, as modified by the Joint Research Centre, licensed under CC BY-NC-ND 4.0. Users of the IEA-EDGAR CO2 data should contact the IEA at compliance@iea.org if they wish to use such data outside the terms of the CC-BY-NC-ND 4.0 licence.