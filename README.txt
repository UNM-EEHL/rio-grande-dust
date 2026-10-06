River Flow, Dust, and Human Health on the Middle Rio Grande: interactive tools
Environmental Economics and Health Lab, University of New Mexico

What this is
  Three browser tools built on the results of "Flow in the Middle Rio Grande
  and Particulate Air Pollution in the Albuquerque Area" (Benjamin A. Jones
  and Robert P. Berrens, 2026, working paper):

    pm10.html        river flow and downwind PM10
    mortality.html   river flow and short-term modeled mortality (all causes,
                     cardiovascular, respiratory), Bernalillo and Sandoval
                     counties
    costs.html       river flow and the economic cost of that mortality

  index.html is the overview page. Everything runs in the browser; there is
  no server.

Scenarios are set at the Central Avenue gauge (public tools only)
  Every scenario in these tools is set at the Central Avenue gauge in
  Albuquerque (USGS 08330000), and on each day the other three reaches move
  in the same proportion. This is done only for these public tools, so a
  reader can change one familiar flow and see what follows for PM10,
  mortality, and costs. It is NOT the study's headline. The paper's results,
  its valuation, and every number in its documents apply the added flow, the
  low-flow floor, and the dry-channel comparison to each reach's own gauge
  (Section 11 of the replication do-file). The 10% cut and the climate
  scenarios are the same either way; the added flow, the floor, and the
  dry-channel comparison give different numbers here than in the paper.

Where the numbers come from
  data/ holds four files written by Section 17 of the study's replication
  do-file:

    tool_daily.csv    one row per day, 2015 to 2024: population-weighted
                      downwind hours on each of the four river reaches, each
                      reach's flow, population-weighted PM10, baseline daily
                      mortality by cause, the exposed population, and a flag
                      for days the Central Avenue gauge read below 100 cfs
    tool_params.csv   the headline regression coefficient and its standard
                      error, the three mortality coefficients of Liu et al.
                      (2019, New England Journal of Medicine 381:705-715,
                      https://doi.org/10.1056/NEJMoa1817364) and their
                      standard errors, the value of a statistical life and
                      its 2.5th and 97.5th percentiles, and monthly mean PM10
    tool_draws.csv    2,000 joint draws of the four coefficients, for the
                      95% intervals
    tool_checks.csv   the tools' scenarios computed in Stata, the targets
                      the browser code is tested against

  assets/model.js applies the study's equations to those files; it contains
  no estimated number of its own.

Checking the tools against the study
  With Node.js installed, from this folder:

    node tests/reconcile.mjs

  It recomputes every scenario in data/tool_checks.csv in the browser code
  and reports the largest difference from Stata. Section 17 of the do-file
  in turn checks those scenarios against the published valuation tables.

Viewing locally
  Browsers block data loading from files opened directly, so serve the
  folder, for example with  python -m http.server  and then open
  http://localhost:8000/

Contact
  Benjamin A. Jones, Department of Economics, University of New Mexico,
  bajones@unm.edu
