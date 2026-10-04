Document Comparison — Testing Guide
Ground-truth checklist for comparing the two fictional Northstar/Meridian Master Services Agreements. These files are for software testing only.
How to test
1.	Upload Version 1 as the original and Version 2 as the revised contract.
2.	Run comparison and inspect clause alignment, not just character-level differences.
3.	Verify old and new wording against the respective source documents.
4.	Check that unchanged provisions are not reported as substantive changes.
5.	Filter/sort by significance and review the rationale.
6.	If supported, click each result to open the relevant passage in both documents.
Expected changes
Provision	Version 1	Version 2	Significance	Expected explanation
Initial term	24 months	36 months	High	Longer initial commitment.
Monthly service fee	AED 28,000	AED 32,000	High	Monthly recurring cost rises by AED 4,000.
Invoice payment deadline	30 days	45 days	Medium	Client gets 15 extra days to pay undisputed invoices.
Production integration availability	99.7%	99.0%	High	Lower availability target.
Security incident notification	24 hours	72 hours	High	Client may be notified later about a confirmed incident.
Security log retention	180 days	90 days	High	Shorter retained security-log history.
Return/delete Client Data	30 days	60 days	Medium	Longer period to return or delete data.
Acceptance review period	10 Business Days	15 Business Days	Low/Medium	Client gets more time to test milestones.
Professional indemnity insurance	AED 2,000,000	AED 1,000,000	Medium/High	Coverage is reduced by half.
Cyber liability insurance	AED 1,000,000	AED 500,000	Medium/High	Coverage is reduced by half.
General liability cap	AED 100,000	AED 1,000,000	High	Cap increases tenfold, subject to unchanged exceptions.
RTO	8 hours	12 hours	High	Recovery time objective becomes slower.
RPO	1 hour	4 hours	High	Potential data-loss window increases.
Client termination for convenience	90 days' notice	30 days' notice	Medium/High	Client can exit with less notice.
Feedback clause	General feedback not identifying Client or revealing non-public information	Broader feedback wording includes suggestions referring to Client business context, with no disclosure of confidential information to third parties	Medium	Permitted use is broader; do not claim ownership transferred.
Operational contact	No sentence in this clause	Added operational contact sentence	Low	Minor coordination obligation added.
Regulatory Cooperation	Absent	Added	Medium	Reasonable cooperation for relevant regulator inquiries, subject to limits.
Quarterly Executive Review	Present	Removed	Medium	Express quarterly executive review obligation is deleted.
Expected unchanged examples
Effective Date (1 January 2027); automatic renewal periods (12 months); non-renewal notice (60 calendar days); invoice dispute notice (10 Business Days); Priority 1 acknowledgement (15 minutes); Priority 1 restoration target (4 hours); critical patch target (7 calendar days); high-severity patch target (14 calendar days); Dubai courts; UAE law as applied in Dubai.
Suggested questions and expected answers
What are the most significant changes?
Prioritize the liability cap, incident-notification window, availability target, RTO/RPO, term and fee changes; explain the basis for the ordering.
Which changes increase the Client's costs or commitment?
Monthly fee rises from AED 28,000 to AED 32,000 and the initial term grows from 24 to 36 months.
Which changes may weaken security or resilience?
Incident notice moves from 24 to 72 hours; log retention falls from 180 to 90 days; RTO moves from 8 to 12 hours; RPO from 1 to 4 hours; cyber insurance drops from AED 1,000,000 to AED 500,000.
Did the liability cap change?
Yes, from AED 100,000 to AED 1,000,000. The stated exceptions remain unchanged.
Was governing law changed?
No. The governing-law and Dubai-jurisdiction wording is unchanged.
What was added and removed?
Regulatory Cooperation is added; Quarterly Executive Review is removed.
Are all changes unfavorable to the Client?
No. A longer payment deadline and shorter Client convenience-termination notice may benefit the Client.
Can the app say whether the contract is legally acceptable?
It should explain textual changes and potential implications, not provide a definitive legal conclusion.
Quality checks
•	Every old/new quote must exist in its own source document.
•	Check numbers, amounts, percentages, notice windows and retention periods carefully.
•	Do not mark mere whitespace or formatting changes as substantive.
•	Do not report unchanged clauses as changed.
•	If clause matching is uncertain, flag for review rather than asserting a false match.
•	Explain significance ratings; they are heuristic, not legal advice.
