River Flow, Dust, and Human Health on the Middle Rio Grande: interactive tools
Environmental Economics and Health Lab (EEHL), University of New Mexico

What this is
  Three browser tools built on the results of "River of Dust: The Drying
  Middle Rio Grande, Particulate Air Pollution, and Human Health Damages"
  (Benjamin A. Jones and Robert P. Berrens, 2026, working paper):

    pm10.html        river flow and downwind PM10
    mortality.html   river flow and short-term modeled mortality (all-causes,
                     cardiovascular, respiratory), Bernalillo and Sandoval
                     counties
    costs.html       river flow and the economic damages from that mortality

  index.html is the overview page. Everything runs in the browser; there is
  no server.

How the tools work
  The tools complement the study. They use its estimates: the regression
  coefficient, the three mortality coefficients, the value of a statistical
  life, and the daily downwind hours, river flows, PM10, and baseline
  mortality of 2015 to 2024. Readers construct their own river flow
  scenarios from them, including the study's own. Every scenario changes
  each of the four reaches at its own gauge. Scenarios that change the
  flow, add water, set a low-flow floor, or compare with a nearly dry river
  run on every day of 2015 to 2024; the two climate scenarios run on a
  typical year, the 2015-2024 average of each calendar day. Values are in
  2025 prices, at the US EPA value of a statistical life of $11.82 million.
  The 95% intervals come from 2,000 Monte Carlo draws of the regression
  coefficient and the three mortality coefficients.

Water volume at the Central Avenue gauge
  Each tool also reports the water a scenario adds or removes at the Central
  Avenue gauge in Albuquerque (USGS 08330000), in acre-feet (AF) per year:
  the scenario's flow at that gauge minus the flow it carried, times 1.98347
  AF per cfs-day, per year (assets/model.js, water()). This is the volume at
  one of the four reach gauges only; releases upstream would need to be
  larger because of losses before the water reaches Albuquerque. It is
  arithmetic on the gauge record and changes no estimate.

Where the numbers come from
  code/site_data.do (Stata 19) reads the outputs of the study's replication
  do-file and writes the six files in data/:

    tool_daily.csv      one row per day, 2015 to 2024: population-weighted
                        downwind hours on each of the four river reaches,
                        each reach's flow, population-weighted PM10,
                        baseline daily mortality by cause, and the exposed
                        population
    tool_climyear.csv   the typical year: for each of 365 calendar days, the
                        2015-2024 mean of the downwind hours summed over the
                        reaches, PM10, baseline mortality, and flow
    tool_params.csv     the study's regression coefficient and its standard
                        error, the three mortality coefficients of Liu et al.
                        (2019, New England Journal of Medicine 381:705-715,
                        https://doi.org/10.1056/NEJMoa1817364) and their
                        standard errors, the value of a statistical life and
                        its 2.5th and 97.5th percentiles in 2025 prices, the
                        dry-season multiplier k, and monthly mean PM10
    tool_draws.csv      2,000 joint draws of the four coefficients
    tool_checks.csv     the tools' scenarios computed in Stata, the targets
                        the browser code is tested against
    tool_paper.csv      the study's published scenario results, which the
                        tools use for the intervals of the study's own
                        scenarios

  To rebuild them, run the study's replication do-file first, then, from
  this folder,

    global REPL "<the folder holding the study's replication package>"
    do code/site_data.do

  site_data.do checks that the tools' daily series reproduce the study's,
  and that the tools give the study's own scenarios exactly.
  assets/model.js applies the study's equations to those files; it contains
  no estimated number of its own.

Checking the tools against Stata
  With Node.js installed, from this folder:

    node tests/reconcile.mjs

  It recomputes every scenario in data/tool_checks.csv and data/tool_paper.csv
  in the browser code and reports the largest difference.

Viewing locally
  Browsers block data loading from files opened directly, so serve the
  folder, for example with  python -m http.server  and then open
  http://localhost:8000/

Contact
  Benjamin A. Jones, Department of Economics, University of New Mexico,
  bajones@unm.edu
