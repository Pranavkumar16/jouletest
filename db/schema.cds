namespace com.ncs.glassist;

using { managed, cuid } from '@sap/cds/common';

entity GLRules : cuid, managed {
  pattern     : String(500) @Common.Label: 'Rule Pattern';
  glAccount   : String(20)  @Common.Label: 'GL Account';
  description : String(500) @Common.Label: 'Rule Description';
  active      : Boolean default true @Common.Label: 'Active';
}

entity Postings : cuid {
  description  : String(500)   @Common.Label: 'Posting Description';
  amount       : Decimal(15,2) @Common.Label: 'Amount';
  vendor       : String(200)   @Common.Label: 'Vendor';
  postingDate  : Date          @Common.Label: 'Posting Date';
  glAccount    : String(20)    @Common.Label: 'GL Account';
  matchedRule  : Association to GLRules;
  confidence   : Decimal(3,2)  @Common.Label: 'Match Confidence';
  status       : String(20)    @Common.Label: 'Status';
  createdAt    : Timestamp;
}

entity UnmatchedPostings : cuid {
  posting            : Association to Postings;
  suggestedPattern   : String(500)  @Common.Label: 'Suggested Pattern';
  suggestedGL        : String(20)   @Common.Label: 'Suggested GL Account';
  rationale          : LargeString  @Common.Label: 'AI Rationale';
  similarCount       : Integer      @Common.Label: 'Similar Postings';
  status             : String(20)   @Common.Label: 'Review Status';
  createdAt          : Timestamp;
  reviewedBy         : String(100);
  reviewedAt         : Timestamp;
}
