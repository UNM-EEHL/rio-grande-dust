*==============================================================================
* site_data.do
*
* The data behind the interactive tools on the public website for:
*   Jones, B.A., and Berrens, R.P. (2026). River of Dust: The Drying Middle Rio
*   Grande, Particulate Air Pollution, and Human Health Damages.
*   https://unm-eehl.github.io/rio-grande-dust/
*
* Version 2026-10-29.  Stata 19.
*
* The website is separate from the paper's replication package. This file
* builds nothing of the paper: it reads the outputs the paper's replication
* do-file (replication_RioGrandePM10.do) has already written and turns them
* into the five small files in data/ that the browser tools load. Run the
* paper's replication do-file first, then, from this folder (the website's
* root),
*
*     global REPL "<the folder holding the paper's replication package>"
*     do code/site_data.do
*
* It reads, from $REPL,
*     replication_RioGrandePM10.dta              the CPI-U rows
*     output/analysis.dta                        analysis variables
*     output/tables/rungE1.dta                   the PM10-flow coefficient
*     output/figdata/valuation_daily_idw.dta     the paper's daily series
*     output/figdata/climate_year.dta            the climatological year
*     output/tables/valuation_idw.dta            paper Scenarios (1) to (3)
*     output/tables/valuation_floor_alldays.dta  paper Scenario (4)
*     output/tables/climate_scenarios.dta        paper Scenarios (5) to (9)
*     output/tables/paper_tables2_3.dta          the paper's Tables 2 and 3
* and writes, to data/,
*     tool_daily.csv      one row per day, 2015 to 2024
*     tool_climyear.csv   the 365-day climatological year
*     tool_params.csv     one row per named parameter
*     tool_draws.csv      2,000 joint draws of b_E and the three betas
*     tool_checks.csv     the tools' scenarios computed here, the targets
*                         tests/reconcile.mjs checks the browser code against
*     tool_paper.csv      the paper's Tables 2 and 3, whose 95% intervals the
*                         tools display for the paper's nine scenarios
*
*     THE CHAIN. The tools apply the paper's Eqs. (2) to (5) unchanged:
*
*         dE_t  = SUM_r  Hbar_rt x ( ln Q_rts - ln Q_rt )      paper Eq. (2)
*         dC_t  = PM10bar_t x ( exp( b_E x dE_t ) - 1 )        paper Eq. (3)
*         dM_te = Y0_te x ( exp( beta_e x dC_t ) - 1 )         paper Eq. (4)
*         V_te  = dM_te x VSL                                  paper Eq. (5)
*
*     with the value of a statistical life (VSL) in 2025 prices, as in the
*     paper.
*
*     THE DAILY INPUT. The paper collapses each scenario's exposure term to
*     one population-weighted value per day. Because the exposure term is
*     linear in the downwind hours, the same collapse applied to the hours
*     themselves gives a reach-level daily series, Hbar_rt, from which any
*     flow scenario can be built: the population-weighted mean of reach r's
*     downwind hours on day t, over the same monitor-days and with the same
*     inverse-distance-squared weights as the paper. A monitor-day with no
*     downwind hours recorded on a reach contributes zero, exactly as in the
*     paper. Part 3 rebuilds the paper's exposure terms from this series and
*     checks that they agree exactly.
*
*     THE SCENARIOS THE TOOLS OFFER. Every scenario applies to each reach's
*     own gauge, as in the paper (SI Eqs. S1 to S4 and S7):
*       on the observed record, 2015 to 2024, annual figures the mean over
*       days times 365.25:
*         percent change p        ln(1 + p) on every reach              (S1)
*         add A cfs               ln( (Q_rt + A) / Q_rt ) on every reach (S2)
*         a floor F               ln( F / Q_rt ) on a reach below F      (S3)
*         against a river of Q0   ln(Q0) - ln(Q_rt) on every reach       (S4),
*                                 reported as the paper reports Scenario
*                                 (1): the PM10, mortality, and damages that
*                                 observed flows prevent, with a negative
*                                 sign and the interval ends swapped
*       on the climatological year, annual figures the sum over its 365 days:
*         climate cut X           H_t x ln(1 - X) in every month         (S7)
*         dry-season cut X        H_t x ln(1 - 1.5 X) in July to October
*                                 and H_t x ln(1 - k X) in the other
*                                 months, k from SI Eq. (S5)
*     The flow-dependent scenarios need a positive flow on a reach; a reach-
*     day without one contributes nothing, as in the paper. Set to the
*     paper's values, the tools give the paper's Scenarios (1) to (9), and
*     Part 5 checks that they do.
*
*     INTERVALS. The tools compute 95% intervals from the 2,000 joint draws of
*     Part 4. The paper drew separately for each scenario and cause, so for
*     the paper's nine scenarios the tools display the paper's own intervals,
*     from tool_paper.csv. Any other setting uses the joint draws.
*==============================================================================
version 19
clear all
set more off
if `"$REPL"' == "" {
    display as error "Set global REPL to the folder holding the paper's replication package first."
    exit 198
}
global root "$REPL"
global SITE "`c(pwd)'"
capture confirm file "$SITE/assets/model.js"
if _rc {
    display as error "Run this file from the website's root folder (the one holding assets/ and data/)."
    exit 601
}

* the CPI-U ratio and the VSL in 2025 prices, exactly as the paper's
* replication do-file computes them (its Section 11a)
global VSL15 = 8705114
preserve
    use rec yr cpiu if rec == "monitor_day" & !missing(cpiu) using "$root/replication_RioGrandePM10.dta", clear
    quietly summarize cpiu if yr == 2015, meanonly
    global CPI15 = r(mean)
    quietly summarize cpiu if yr == 2025, meanonly
    global CPI25 = r(mean)
restore
global CPIRATIO = $CPI25 / $CPI15
global VSL = $VSL15 * $CPIRATIO
di as text "VSL, 2025 prices " as res %14.0fc $VSL as text "   CPI-U ratio " as res %8.6f $CPIRATIO

di as text _n(2) "{hline 78}"
di as text "THE DATA BEHIND THE WEBSITE TOOLS"
di as text "{hline 78}"

preserve

* ---- 1. Parameters, read back rather than retyped ---------------------------
use "$root/output/tables/rungE1.dta", clear
quietly keep if outcome == "ln_pm10" & fe == "F3" & spec == "fallow"
quietly summarize b, meanonly
local bE = r(mean)
quietly summarize se, meanonly
local seE = r(mean)

* Liu et al. (2019), as in the paper (SI Eqs. S8 and S9)
capture matrix drop CRF17
matrix CRF17 = J(3, 2, .)
matrix CRF17[1, 1] = ln(1 + 0.44/100)/10
matrix CRF17[1, 2] = (ln(1 + 0.50/100)/10 - ln(1 + 0.39/100)/10)/(2*1.959964)
matrix CRF17[2, 1] = ln(1 + 0.36/100)/10
matrix CRF17[2, 2] = (ln(1 + 0.43/100)/10 - ln(1 + 0.30/100)/10)/(2*1.959964)
matrix CRF17[3, 1] = ln(1 + 0.47/100)/10
matrix CRF17[3, 2] = (ln(1 + 0.58/100)/10 - ln(1 + 0.35/100)/10)/(2*1.959964)

* The value of a statistical life in 2025 prices, as in the paper: US EPA's
* 8,705,114 in 2015 prices times the CPI-U ratio. US EPA's figure is the mean
* of a Weibull distribution (scale 9,648,168, shape 1.509588, 2015 prices);
* the tools offer its 2.5th and 97.5th percentiles, restated with the same
* CPI-U ratio, as the low and high values.
local VSL17 = $VSL
local WSC = 9648168
local WSH = 1.509588
local VSLLO = invweibull(`WSH', `WSC', 0.025) * $CPIRATIO
local VSLHI = invweibull(`WSH', `WSC', 0.975) * $CPIRATIO
local VSLMN = `WSC'*exp(lngamma(1 + 1/`WSH'))
di as text "VSL Weibull mean, 2015 prices " %14.0fc `VSLMN' "  (US EPA central " %14.0fc $VSL15 ")"
di as text "VSL, 2025 prices: central " %14.0fc `VSL17' "   2.5th " %14.0fc `VSLLO' ///
    "   97.5th " %14.0fc `VSLHI'

* SI Eq. (S5): the multiplier on the eight months outside July to October,
* from the climatological year the paper's replication do-file wrote
use "$root/output/figdata/climate_year.dta", clear
quietly summarize qtot if lowflow == 1, meanonly
local vlow = r(sum)
quietly summarize qtot, meanonly
local vall = r(sum)
local SLOW = `vlow'/`vall'
local KREST = (1 - 1.5*`SLOW')/(1 - `SLOW')
di as text "SI Eq. (S5): July-October share " %8.6f `SLOW' ", k = " %8.6f `KREST'

* the climatological year, for the climate tools
keep dy mo H pm10 y0_all y0_cvd y0_resp q_central qtot pop_exp
order dy mo H pm10 y0_all y0_cvd y0_resp q_central qtot pop_exp
sort dy
format H pm10 y0_all y0_cvd y0_resp q_central qtot pop_exp %21.16g
quietly export delimited using "$SITE/data/tool_climyear.csv", replace datafmt
tempfile CY
quietly save `CY', replace

* ---- 2. The daily input ------------------------------------------------------
use "$root/output/analysis.dta", clear
capture drop e1samp
gen byte e1samp = 0
replace e1samp = 1 if instudy == 1 ///
    & !missing(crop_3km) & !missing(crop_riv3km) ///
    & !missing(fallow_3km) & !missing(fallow_riv3km)
quietly keep if e1samp == 1 & inrange(yr, 2015, 2024) & !missing(base_all)

local qv1 q_cochiti
local qv2 q_alameda
local qv3 q_central
local qv4 q_isleta
gen byte b100 = 0
forvalues r = 1/4 {
    gen double H`r' = cond(missing(down_hrs`r'), 0, down_hrs`r')
    quietly replace b100 = 1 if `qv`r'' > 0 & `qv`r'' < 100 & !missing(`qv`r'') ///
        & down_hrs`r' > 0 & !missing(down_hrs`r')
}
collapse (mean) H1 H2 H3 H4 pm10 (max) b100 ///
         (firstnm) q_cochiti q_alameda q_central q_isleta ///
         pop_bern pop_sand base_all base_cvd base_resp yr mo ///
         [aweight = popw_idw], by(date)
gen double pop_exp = pop_bern + pop_sand
gen int dim = day(dofm(mofd(date) + 1) - 1)
foreach e in all cvd resp {
    gen double y0_`e' = base_`e' / dim
}
rename (q_cochiti q_alameda q_central q_isleta) (q1 q2 q3 q4)
label var H1 "Population-weighted downwind hours, reach 1 (Cochiti to Alameda)"
label var H2 "Population-weighted downwind hours, reach 2 (Alameda to Central)"
label var H3 "Population-weighted downwind hours, reach 3 (Central to the outfall)"
label var H4 "Population-weighted downwind hours, reach 4 (the outfall to Isleta)"
label var q1 "River flow, reach 1 gauge, cfs"
label var q2 "River flow, reach 2 gauge, cfs"
label var q3 "River flow, reach 3 gauge (Central Avenue), cfs"
label var q4 "River flow, reach 4 gauge, cfs"
label var b100 "A reach below 100 cfs with downwind hours"
keep date yr mo H1 H2 H3 H4 q1 q2 q3 q4 pm10 y0_all y0_cvd y0_resp pop_exp b100
order date yr mo H1 H2 H3 H4 q1 q2 q3 q4 pm10 y0_all y0_cvd y0_resp pop_exp b100
sort date
di as text _n "tool daily input: " _N " days"
tabstat H1 H2 H3 H4 q1 q2 q3 q4 pm10 y0_all, stat(mean min max n) ///
    format(%12.4f) columns(statistics)
tempfile TD
quietly save `TD', replace

* monthly mean of the population-weighted PM10, the single-day tool's default
* baseline concentration
tempname PM
matrix `PM' = J(12, 1, .)
forvalues m = 1/12 {
    quietly summarize pm10 if mo == `m', meanonly
    matrix `PM'[`m', 1] = r(mean)
}

* the daily file, written at full precision
use `TD', clear
gen str10 day = string(date, "%tdCCYY-NN-DD")
format H1 H2 H3 H4 q1 q2 q3 q4 pm10 y0_all y0_cvd y0_resp pop_exp %21.16g
keep day yr mo H1 H2 H3 H4 q1 q2 q3 q4 pm10 y0_all y0_cvd y0_resp pop_exp
order day
quietly export delimited using "$SITE/data/tool_daily.csv", replace datafmt

* ---- 3. The paper's exposure terms rebuilt from the reach-level series ------
use `TD', clear
gen double eS1 = 0
gen double eS2 = 0
gen double eS3 = 0
gen double eS4a = 0
gen double eS4b = 0
gen double eS4c = 0
forvalues r = 1/4 {
    quietly replace eS1  = eS1  + H`r'*ln(0.9)
    quietly replace eS2  = eS2  + H`r'*ln((q`r' + 100)/q`r')  if q`r' > 0 & !missing(q`r')
    quietly replace eS3  = eS3  + H`r'*ln(100/q`r') if q`r' > 0 & q`r' < 100 & !missing(q`r')
    quietly replace eS4a = eS4a + H`r'*(ln(1)  - ln(q`r'))  if q`r' > 0 & !missing(q`r')
    quietly replace eS4b = eS4b + H`r'*(ln(10) - ln(q`r'))  if q`r' > 0 & !missing(q`r')
    quietly replace eS4c = eS4c + H`r'*(ln(50) - ln(q`r'))  if q`r' > 0 & !missing(q`r')
}
quietly merge 1:1 date using "$root/output/figdata/valuation_daily_idw.dta", ///
    keepusing(dE1 dE2 dE3 dE4a dE4b dE4c bind3) assert(match) nogenerate
local worst = 0
foreach s in 1 2 3 4a 4b 4c {
    gen double _d = abs(eS`s' - dE`s')
    quietly summarize _d, meanonly
    local worst = max(`worst', r(max))
    drop _d
}
quietly count if b100 != bind3
local bmis = r(N)
di as text _n "The reach-level series against the paper's daily series, largest absolute difference"
di as text "in the exposure term across six scenarios and every day: " %12.3e `worst'
di as text "below-100-cfs flags that disagree with the paper's: " `bmis'
if `worst' < 1e-9 & `bmis' == 0 di as res "  THE REACH-LEVEL SERIES REPRODUCES THE PAPER: PASS"
else di as error "  THE REACH-LEVEL SERIES DOES NOT REPRODUCE THE PAPER: FAIL"

* ---- 4. The draws -------------------------------------------------------------
* 2,000 joint draws, b_E from N(b_E, se_E) and each beta_e from
* N(beta_e, se_e), independently, as in the paper. The tools compute their
* intervals from these same draws, so the interval targets in Part 5 are exact.
clear
set seed 20261005
quietly set obs 2000
gen int draw = _n
gen double bE = `bE' + `seE'*rnormal()
gen double b_all  = CRF17[1, 1] + CRF17[1, 2]*rnormal()
gen double b_cvd  = CRF17[2, 1] + CRF17[2, 2]*rnormal()
gen double b_resp = CRF17[3, 1] + CRF17[3, 2]*rnormal()
format bE b_all b_cvd b_resp %21.16g
quietly export delimited using "$SITE/data/tool_draws.csv", replace datafmt
mata: DRAWS17 = st_data(., ("bE", "b_all", "b_cvd", "b_resp"))

* ---- 5. The tools' scenarios computed here, the targets ---------------------
* tooldeaths() returns the mean change in PM10, the annual mortality at the
* point estimates, and its 2.5th and 97.5th percentiles across the draws
* (the 50th and 1,950th of the 2,000 sorted draws). On the observed record
* (yearsum = 0) the annual figure is the mean over days times 365.25, and on
* the climatological year (yearsum = 1) it is the sum over its 365 days, both
* as in the paper's replication do-file.
capture mata: mata drop tooldeaths()
mata:
real rowvector tooldeaths(real colvector pm10, real colvector dE,
                          real colvector y0, real scalar bE, real scalar b,
                          real colvector bEd, real colvector bd,
                          real scalar yearsum)
{
    real colvector s
    real scalar k, n, cen, dcm, f
    n = rows(pm10)
    f = (yearsum ? n : 365.25)
    dcm = mean(pm10 :* (exp(bE :* dE) :- 1))
    cen = mean(y0 :* (exp(b :* (pm10 :* (exp(bE :* dE) :- 1))) :- 1)) * f
    s = J(rows(bEd), 1, .)
    for (k = 1; k <= rows(bEd); k++) {
        s[k] = mean(y0 :* (exp(bd[k] :* (pm10 :* (exp(bEd[k] :* dE) :- 1))) :- 1)) * f
    }
    s = sort(s, 1)
    return((dcm, cen, s[floor(0.025*rows(s))], s[ceil(0.975*rows(s))], n))
}
end

tempname tc
tempfile TCK
postfile `tc' str12 scen str10 type double value str4 endpoint int prow ///
    double(dC_mean deaths_yr d_lo d_hi dollars_yr v_lo v_hi ndays) ///
    using `TCK', replace

* the observed record. prow is the paper's scenario number, 0 if not one.
use `TD', clear
quietly keep if !missing(pm10) & !missing(y0_all)
local SC pct_m10 pct_m30 pct_p50 add_100 add_50 floor_100 floor_50 ref_1 ref_10 ref_50
foreach s of local SC {
    capture drop dEs
    gen double dEs = 0
    local sg = 1
    if substr("`s'", 1, 4) == "pct_" {
        local v = real(substr("`s'", 6, .))/100
        if substr("`s'", 5, 1) == "m" local v = -`v'
        local ty "percent"
        forvalues r = 1/4 {
            quietly replace dEs = dEs + H`r'*ln(1 + `v')
        }
    }
    if substr("`s'", 1, 4) == "add_" {
        local v = real(substr("`s'", 5, .))
        local ty "add"
        forvalues r = 1/4 {
            quietly replace dEs = dEs + H`r'*ln((q`r' + `v')/q`r') if q`r' > 0 & !missing(q`r')
        }
    }
    if substr("`s'", 1, 6) == "floor_" {
        local v = real(substr("`s'", 7, .))
        local ty "floor"
        forvalues r = 1/4 {
            quietly replace dEs = dEs + H`r'*ln(`v'/q`r') if q`r' > 0 & q`r' < `v' & !missing(q`r')
        }
    }
    if substr("`s'", 1, 4) == "ref_" {
        local v = real(substr("`s'", 5, .))
        local ty "reference"
        local sg = -1
        forvalues r = 1/4 {
            quietly replace dEs = dEs + H`r'*(ln(`v') - ln(q`r')) if q`r' > 0 & !missing(q`r')
        }
    }
    local pr = 0
    if "`s'" == "ref_1"     local pr = 1
    if "`s'" == "pct_m10"   local pr = 2
    if "`s'" == "add_100"   local pr = 3
    if "`s'" == "floor_100" local pr = 4
    local i = 0
    foreach e in all cvd resp {
        local ++i
        local bpt = CRF17[`i', 1]
        mata: st_matrix("R17", tooldeaths(st_data(., "pm10"), st_data(., "dEs"), st_data(., "y0_`e'"), `bE', `bpt', DRAWS17[., 1], DRAWS17[., `i' + 1], 0))
        * a reference river is reported as the paper reports Scenario (1):
        * what observed flows prevent, negative, with the interval ends swapped
        local c1 = `sg'*R17[1, 1]
        local c2 = `sg'*R17[1, 2]
        local lo = cond(`sg' == 1, R17[1, 3], -R17[1, 4])
        local hi = cond(`sg' == 1, R17[1, 4], -R17[1, 3])
        post `tc' ("`s'") ("`ty'") (`v') ("`e'") (`pr') (`c1') (`c2') (`lo') (`hi') ///
            (`c2'*`VSL17') (`lo'*`VSL17') (`hi'*`VSL17') (R17[1, 5])
    }
}

* the climatological year
use `CY', clear
gen byte jo = inrange(mo, 7, 10)
local SC clim_12 clim_30 clim_50 clim_20 seas_12 seas_30 seas_20
foreach s of local SC {
    capture drop dEs
    local v = real(substr("`s'", 6, .))/100
    if substr("`s'", 1, 5) == "clim_" {
        local ty "climate"
        gen double dEs = H*ln(1 - `v')
    }
    else {
        local ty "seasonal"
        gen double dEs = H*cond(jo, ln(1 - 1.5*`v'), ln(1 - `KREST'*`v'))
    }
    local pr = 0
    if "`s'" == "clim_12" local pr = 5
    if "`s'" == "clim_30" local pr = 6
    if "`s'" == "clim_50" local pr = 7
    if "`s'" == "seas_12" local pr = 8
    if "`s'" == "seas_30" local pr = 9
    local i = 0
    foreach e in all cvd resp {
        local ++i
        local bpt = CRF17[`i', 1]
        mata: st_matrix("R17", tooldeaths(st_data(., "pm10"), st_data(., "dEs"), st_data(., "y0_`e'"), `bE', `bpt', DRAWS17[., 1], DRAWS17[., `i' + 1], 1))
        post `tc' ("`s'") ("`ty'") (`v') ("`e'") (`pr') (R17[1, 1]) (R17[1, 2]) ///
            (R17[1, 3]) (R17[1, 4]) (R17[1, 2]*`VSL17') (R17[1, 3]*`VSL17') ///
            (R17[1, 4]*`VSL17') (R17[1, 5])
    }
}
* the single-day check: a monitor downwind for 24 hours, flow halved
local day24 = 100*(exp(`bE'*24*ln(0.5)) - 1)
post `tc' ("day_half") ("day") (0.5) ("pm10") (0) (`day24') (.) (.) (.) ///
    (.) (.) (.) (.)
postclose `tc'

* The paper's nine scenarios: the tools' central estimates must equal the
* paper's, read from the files the paper's replication do-file wrote, to
* rounding in the last place.
tempfile TC PAP
use "$root/output/tables/valuation_idw.dta", clear
quietly keep if inlist(scen, 1, 2, 4)
gen byte prow = cond(scen == 4, 1, cond(scen == 1, 2, 3))
quietly replace deaths_yr = -deaths_yr if prow == 1
quietly replace dC_mean = -dC_mean if prow == 1
keep prow endpoint deaths_yr dC_mean
quietly save `PAP', replace
use "$root/output/tables/valuation_floor_alldays.dta", clear
gen byte prow = 4
keep prow endpoint deaths_yr dC_mean
append using `PAP'
quietly save `PAP', replace
use "$root/output/tables/climate_scenarios.dta", clear
quietly keep if popbase == "today"
gen byte prow = 4 + real(substr(scen, 2, 1))
keep prow endpoint deaths_yr dC_mean
append using `PAP'
rename (deaths_yr dC_mean) (d_paper c_paper)
quietly save `PAP', replace

use `TCK', clear
* merge leaves rows tied on the key in no fixed order, so the posting order
* is kept and restored for a file that is identical from run to run
gen long _ord = _n
quietly save `TC', replace
quietly keep if prow > 0
quietly merge 1:1 prow endpoint using `PAP'
quietly count if _merge == 3
local nm = r(N)
gen double _dev = max(abs(deaths_yr - d_paper)/max(abs(d_paper), 1e-12), ///
    abs(dC_mean - c_paper)/max(abs(c_paper), 1e-12)) if _merge == 3
quietly summarize _dev, meanonly
di as text _n "the tools against the paper's Scenarios (1) to (9), " `nm' ///
    " scenario-cause rows, largest relative difference " %10.3e r(max)
if `nm' == 27 & r(max) < 1e-8 di as res "  THE TOOLS REPRODUCE THE PAPER'S NINE SCENARIOS: PASS"
else di as error "  THE TOOLS DO NOT REPRODUCE THE PAPER'S NINE SCENARIOS: FAIL"
use `TC', clear
sort _ord
drop _ord
format dC_mean deaths_yr d_lo d_hi dollars_yr v_lo v_hi %21.16g
quietly export delimited using "$SITE/data/tool_checks.csv", replace datafmt
list scen prow endpoint dC_mean deaths_yr d_lo d_hi if endpoint != "cvd", ///
    noobs clean abbreviate(10)

* ---- 6. The parameter file ----------------------------------------------------
clear
quietly set obs 27
gen str12 name = ""
gen double value = .
local i = 0
foreach p in bE seE {
    local ++i
    quietly replace name = "`p'" in `i'
    quietly replace value = ``p'' in `i'
}
local j = 0
foreach e in all cvd resp {
    local ++j
    local ++i
    quietly replace name = "b_`e'" in `i'
    quietly replace value = CRF17[`j', 1] in `i'
    local ++i
    quietly replace name = "se_`e'" in `i'
    quietly replace value = CRF17[`j', 2] in `i'
}
foreach p in VSL17 VSLLO VSLHI KREST {
    local ++i
    quietly replace name = "`p'" in `i'
    quietly replace value = ``p'' in `i'
}
local ++i
quietly replace name = "VSL_2015" in `i'
quietly replace value = $VSL15 in `i'
local ++i
quietly replace name = "cpi_ratio" in `i'
quietly replace value = $CPIRATIO in `i'
forvalues m = 1/12 {
    local ++i
    quietly replace name = "pm10_mo`m'" in `i'
    quietly replace value = `PM'[`m', 1] in `i'
}
local ++i
quietly replace name = "ndraws" in `i'
quietly replace value = 2000 in `i'
quietly replace name = "VSL" if name == "VSL17"
quietly replace name = "VSL_lo" if name == "VSLLO"
quietly replace name = "VSL_hi" if name == "VSLHI"
quietly replace name = "k_offseason" if name == "KREST"
format value %21.16g
quietly export delimited using "$SITE/data/tool_params.csv", replace datafmt
list, noobs clean

restore

* ---- 7. The paper's Tables 2 and 3, for the intervals the tools display ----
use "$root/output/tables/paper_tables2_3.dta", clear
keep prow endpoint dC_mean deaths_yr d_lo d_hi m_dollars_yr m_v_lo m_v_hi
format dC_mean deaths_yr d_lo d_hi m_dollars_yr m_v_lo m_v_hi %21.16g
sort prow endpoint
quietly export delimited using "$SITE/data/tool_paper.csv", replace datafmt
di as text _n "tool_paper.csv: " _N " rows, the paper's nine scenarios by three causes"
di as res _n "SITE DATA WRITTEN"
