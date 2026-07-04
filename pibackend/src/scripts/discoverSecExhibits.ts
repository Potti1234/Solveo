import { createSchema } from "../db/client";
import { discoverCreditAgreementExhibits } from "../services/sec";

createSchema();

const ticker = process.argv[2] ?? "AAPL";
const result = await discoverCreditAgreementExhibits(ticker);

console.log(
  JSON.stringify(
    {
      company: result.company,
      filings: result.filings.map((filing) => ({
        form: filing.form,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate,
        primaryDocumentUrl: filing.primaryDocumentUrl
      })),
      exhibitCandidates: result.exhibitCandidates
    },
    null,
    2
  )
);
