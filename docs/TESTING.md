# End-to-end testing

Eleven tests cover the path from partner click to payout decision. Run them in any desktop browser with the
developer tools open; a full pass takes about 20 minutes.

## Set up

1. Serve the site (locally with `python3 -m http.server 8765 --directory demo`, or use the live demo).
2. Open the site and the developer tools.
3. **Start clean** by running this in the console. It removes the partner cookie, the form data and all
   ledger rows:

    ```js
    localStorage.clear(); sessionStorage.clear(); document.cookie = 'plx_click=; max-age=0; path=/';
    ```

4. Open PartnerLedger in a second tab and keep it visible.

After every submit, the confirmation page shows a "Sent to PartnerLedger" box with the result, verdict, score
and signals.

## Where to look

| Check | Developer tools | Healthy result |
| --- | --- | --- |
| Pixel loaded | Network, filter `plx` | `plx.js` with status 200 |
| Click stored | Storage or Application, Cookies | `plx_click` contains the `plclid` value from the URL |
| Form snapshot | Session storage, `plx_form` | Input counts and `elapsedMs` after submit |
| What was sent | Console: `plxLast` | `result` and the full record |
| Events pushed | Console: `dataLayer.filter(e => e.event)` | `application_submitted`, then `partner_conversion` |
| Ledger contents | Local storage, `partnerledger_conversions` | One entry per order ID |

## Test cases

| # | Test | Steps | Expected result |
| --- | --- | --- | --- |
| 1 | Pixel loads | Start clean. Press **Arrive from partner RateCompass** | `plx.js` returns 200 |
| 2 | Attribution | Same page as test 1 | `plx_click` holds the URL's click ID and partner `RC-1001` |
| 3 | Human | Start the application, type every field, wait 3 seconds, submit | `human`, score 0, no signals. Ledger: Payable |
| 4 | Autofill | Arrive from a partner, press **Autofill form**, wait 3 seconds, submit | `suspicious`, 0.30, `no_typing`. Ledger: Held for review |
| 5 | Fast human | Type short values and submit within 3 seconds of the page loading | `suspicious`, 0.40, `fast_submit`. A slower run is correctly `human` |
| 6 | Bot | Press **Run automated visitor from DealDrifter** and do not touch anything | `bot`, 0.94, three signals. Ledger: Excluded, DealDrifter |
| 7 | Duplicate | Reload the confirmation page from test 6 | Result `duplicate`. Ledger count unchanged |
| 8 | No partner | Start clean, open `apply.html` directly, type and submit | Result `unattributed`. Nothing added to the ledger |
| 9 | Last click wins | Arrive from RateCompass, then from DealDrifter, then apply by hand | Credited to `DD-2002` |
| 10 | Review | Create a held row (test 4), then press **Release** on it | Payable (reviewed). Payable total rises by $75 |
| 11 | Live update | Keep the ledger open in another window and repeat test 3 | The new row appears without reloading |

## Verifying the Tag Manager deployment

The logic was first tested with the tags called directly from the page, then through Google Tag Manager in
Preview mode (Tag Assistant). The results had to match.

| What was checked | Where in Tag Assistant | Result |
| --- | --- | --- |
| Base tag fires on every page | Summary, Tags fired | Once per page load |
| Conversion tag fires once per application | `application_submitted` event, Tags Fired | Fired once, on that event only |
| Confirmation number is passed correctly | Same event, Variables | `DLV - confirmation_id` matches the page |
| Verdict reaches the data layer | `partner_conversion` event, Data Layer | `plx_verdict` and `plx_partner_id` present |
| Paused tag stays silent | Summary, Tags not fired | GA4 tag listed as Paused; no analytics cookies |
| Same results as direct mode | Ledger and confirmation page | Human 0.00, bot 0.94, reload is a duplicate |
| Only the expected cookie is set | Browser storage, Cookies | `plx_click` only, expiring in 30 days |

## If a result is wrong

- **A typed run shows `no_typing`:** the browser filled the fields. Type at least one character yourself.
- **The bot run shows `suspicious` with `form_not_observed`:** the script submitted before the pixel loaded.
  Run it again.
- **Nothing reaches the ledger:** check for the `plx_click` cookie. Without a partner link there is no one to pay.
- **Everything shows `bot` with `automation_flag`:** the browser is being driven by a testing tool.
- **Nothing works at all:** the pages were opened as files. Serve them over HTTP.
