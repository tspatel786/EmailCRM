import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCin, parseCin, normalizeCompanyName, industryFromNic, industryFromText, suggestOpportunities, scoreLead,
  matchRoles, extractEmails, extractPhones, htmlToLines, extractPeople, contactConfidence, candidateDomains,
  pageMatchesCompany, guessColumnMapping, parseDateFlexible, normalizeCompanyRow, registrableDomain, websiteFromEmail,
} from "../dist/leads.js";

test("CIN normalization and parsing", () => {
  assert.equal(normalizeCin(" u62099mh2026ptc123456 "), "U62099MH2026PTC123456");
  assert.equal(normalizeCin("AAB-1234"), "AAB-1234");
  assert.equal(normalizeCin("U62099MH2026PTC12345"), null);
  assert.equal(normalizeCin(""), null);
  assert.deepEqual(parseCin("L17110MH1973PLC019786"), { listed: true, nic: "17110", state: "Maharashtra", year: 1973, type: "PLC" });
});

test("company name normalization", () => {
  assert.equal(normalizeCompanyName("Sharma Traders Private Limited"), "sharma traders");
  assert.equal(normalizeCompanyName("ABC Tech (OPC) Pvt. Ltd."), "abc tech");
});

test("industry from NIC and text", () => {
  assert.equal(industryFromNic("62099"), "Information Technology");
  assert.equal(industryFromNic("10712"), "Manufacturing");
  assert.equal(industryFromNic("46909"), "Wholesale & Distribution");
  assert.equal(industryFromNic("47110"), "Retail");
  assert.equal(industryFromNic("86100"), "Healthcare");
  assert.equal(industryFromNic("85100"), "Education");
  assert.equal(industryFromNic(""), "Other");
  assert.equal(industryFromText("Manufacturing of steel parts"), "Manufacturing");
  assert.equal(industryFromText("software development"), "Information Technology");
});

test("opportunities are suggestions and include website when missing", () => {
  const o = suggestOpportunities("Manufacturing", false);
  assert.equal(o[0], "Website Development");
  assert.ok(o.includes("ERP"));
  assert.ok(o.length <= 7);
});

test("lead score is explainable and missing data adds nothing", () => {
  const now = new Date("2026-11-22");
  const full = scoreLead({ registrationDate: "2026-10-01", hasWebsite: true, hasBusinessEmail: true, hasBusinessPhone: true, industry: "Manufacturing", now });
  assert.equal(full.score, 75);
  assert.equal(full.category, "hot");
  assert.equal(full.reasons.length, 5);
  const bare = scoreLead({ registrationDate: null, hasWebsite: false, hasBusinessEmail: false, hasBusinessPhone: false, industry: "Other", now });
  assert.equal(bare.score, 0);
  assert.equal(bare.category, "cold");
});

test("all seven roles match their synonyms", () => {
  assert.deepEqual(matchRoles("Chief Executive Officer"), ["ceo"]);
  assert.deepEqual(matchRoles("Co-Founder & CEO"), ["ceo", "founder"]);
  assert.deepEqual(matchRoles("Managing Director"), ["managing_director"]);
  assert.deepEqual(matchRoles("Whole-Time Director"), ["director"]);
  assert.deepEqual(matchRoles("Proprietor"), ["owner"]);
  assert.deepEqual(matchRoles("Head of IT"), ["it_manager"]);
  assert.deepEqual(matchRoles("Procurement Manager"), ["purchase_manager"]);
  assert.deepEqual(matchRoles("Founder and Managing Director"), ["founder", "managing_director"]);
  assert.deepEqual(matchRoles("Director"), ["director"], "director is never assumed to be CEO");
  assert.deepEqual(matchRoles("Sales Executive"), []);
});

test("email extraction never constructs addresses and classifies them", () => {
  const html = '<a href="mailto:info@acmeind.co.in">Mail</a> Ravi: ravi.k@acmeind.co.in, partner sales@vendor.com, owner@gmail.com, logo@2x.png, test@example.com';
  const by = Object.fromEntries(extractEmails(html, "www.acmeind.co.in").map((x) => [x.email, x.kind]));
  assert.equal(by["info@acmeind.co.in"], "company_general");
  assert.equal(by["ravi.k@acmeind.co.in"], "person_professional");
  assert.equal(by["sales@vendor.com"], "company_general");
  assert.equal(by["owner@gmail.com"], "company_general");
  assert.ok(!("test@example.com" in by));
  assert.ok(!Object.keys(by).some((k) => k.endsWith(".png")));
  assert.equal(registrableDomain("mail.acme.co.in"), "acme.co.in");
  assert.equal(extractEmails("contact us at the office").length, 0);
});

test("phone extraction handles mobiles and landlines, rejects junk", () => {
  const p = extractPhones('Call +91 98765 43210 or <a href="tel:02172345678">office</a>. Fax 0217-2345678. ID 1111111111.');
  assert.deepEqual(p.map((x) => x.e164).sort(), ["+912172345678", "+919876543210"]);
  assert.equal(p.find((x) => x.e164 === "+912172345678").kind, "company_switchboard");
});

test("people extraction from team pages", () => {
  const html = '<div class="team"><h3>Asha Rao</h3><p>Managing Director</p></div>' +
    '<div><h3>Vikram Shah</h3><p>Head of IT</p></div>' +
    '<p>Rahul Mehta, Purchase Manager</p><p>Our Leadership</p><p>Director</p><p>Read More</p>' +
    '<p>CEO: Neha Kulkarni</p>';
  const names = extractPeople(htmlToLines(html)).map((p) => p.name + "=" + p.roles.join("+")).sort();
  assert.deepEqual(names, ["Asha Rao=managing_director", "Neha Kulkarni=ceo", "Rahul Mehta=purchase_manager", "Vikram Shah=it_manager"]);
});

test("confidence scoring", () => {
  const c = contactConfidence({ officialWebsite: true, exactNameAndDesignation: true, businessEmail: true, businessPhone: false, matchingProfile: false });
  assert.equal(c.score, 75);
  assert.equal(c.level, "medium");
  assert.equal(contactConfidence({ officialWebsite: true, exactNameAndDesignation: true, businessEmail: true, businessPhone: true, matchingProfile: true }).level, "high");
});

test("website candidates and page verification", () => {
  const c = candidateDomains("Sharma Agro Traders Private Limited");
  assert.ok(c.includes("sharmaagrotraders.com"));
  assert.ok(c.includes("sharmaagrotraders.in"));
  assert.ok(c.length <= 9);
  assert.ok(pageMatchesCompany("Welcome to Sharma Agro Traders, Pune", "Sharma Agro Traders Private Limited"));
  assert.ok(!pageMatchesCompany("Sharma Hospital", "Sharma Agro Traders Private Limited"));
  assert.ok(pageMatchesCompany("CIN: U01100MH2026PTC123456", "X Y", "U01100MH2026PTC123456"));
});

test("MCA file mapping, dates and row validation", () => {
  const map = guessColumnMapping(["CIN", "COMPANY_NAME", "DATE_OF_REGISTRATION", "COMPANY_STATUS", "Registered Office Address", "STATE"]);
  assert.equal(map.cin, "CIN");
  assert.equal(map.registration_date, "DATE_OF_REGISTRATION");
  assert.equal(map.registered_address, "Registered Office Address");
  assert.equal(parseDateFlexible("12-10-2026"), "2026-10-12");
  assert.equal(parseDateFlexible("12-Oct-2026"), "2026-10-12");
  assert.equal(parseDateFlexible(46307), "2026-10-12");
  assert.equal(parseDateFlexible("31-02-2026"), null);
  const ok = normalizeCompanyRow({ CIN: "u62099mh2026ptc123456", COMPANY_NAME: " Test  Soft Pvt Ltd ", DATE_OF_REGISTRATION: "01/10/2026", STATE: "MH" }, map);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.state, "Maharashtra");
  assert.equal(ok.value.industry, "Information Technology");
  assert.equal(ok.value.company_name, "Test Soft Pvt Ltd");
  assert.equal(normalizeCompanyRow({ CIN: "123", COMPANY_NAME: "X" }, map).ok, false);
  assert.equal(normalizeCompanyRow({ CIN: "U62099MH2026PTC123456", COMPANY_NAME: "X", DATE_OF_REGISTRATION: "someday" }, map).ok, false);
});

test("real MCA / data.gov.in company master columns are recognised", () => {
  const headers = ["CORPORATE_IDENTIFICATION_NUMBER", "COMPANY_NAME", "COMPANY_STATUS", "COMPANY_CLASS", "COMPANY_CATEGORY", "COMPANY_SUB_CATEGORY",
    "DATE_OF_REGISTRATION", "REGISTERED_STATE", "AUTHORIZED_CAP", "PAIDUP_CAPITAL", "INDUSTRIAL_CLASS", "PRINCIPAL_BUSINESS_ACTIVITY_AS_PER_CIN",
    "REGISTERED_OFFICE_ADDRESS", "REGISTRAR_OF_COMPANIES", "EMAIL_ADDR"];
  const m = guessColumnMapping(headers);
  assert.equal(m.cin, "CORPORATE_IDENTIFICATION_NUMBER");
  assert.equal(m.state, "REGISTERED_STATE");
  assert.equal(m.authorized_capital, "AUTHORIZED_CAP");
  assert.equal(m.paid_up_capital, "PAIDUP_CAPITAL");
  assert.equal(m.nic_code, "INDUSTRIAL_CLASS");
  assert.equal(m.business_activity, "PRINCIPAL_BUSINESS_ACTIVITY_AS_PER_CIN");
  assert.equal(m.registered_email, "EMAIL_ADDR");
  assert.equal(m.company_category, "COMPANY_CATEGORY", "sub-category must not steal category");
  const api = guessColumnMapping(["CIN", "CompanyName", "CompanyRegistrationdate_date", "CompanyStateCode", "nic_code", "CompanyIndustrialClassification", "Registered_Office_Address", "AuthorizedCapital", "PaidupCapital"]);
  assert.equal(api.registration_date, "CompanyRegistrationdate_date");
  assert.equal(api.state, "CompanyStateCode");
  assert.equal(api.business_activity, "CompanyIndustrialClassification");
  const row = normalizeCompanyRow({ CORPORATE_IDENTIFICATION_NUMBER: "U25999MH2026PTC111111", COMPANY_NAME: "Acme Fab Private Limited", DATE_OF_REGISTRATION: "05-10-2026",
    REGISTERED_STATE: "Maharashtra", PAIDUP_CAPITAL: "1,00,000", INDUSTRIAL_CLASS: "25999", EMAIL_ADDR: "Info@AcmeFab.in" }, m);
  assert.equal(row.ok, true);
  assert.equal(row.value.registered_email, "info@acmefab.in");
  assert.equal(row.value.paid_up_capital, 100000);
  assert.equal(row.value.industry, "Manufacturing");
  assert.equal(normalizeCompanyRow({ CORPORATE_IDENTIFICATION_NUMBER: "U25999MH2026PTC111112", COMPANY_NAME: "X", EMAIL_ADDR: "not-an-email" }, m).value.registered_email, null);
});

test("website from registered email domain ignores free mail", () => {
  assert.equal(websiteFromEmail("info@acmefab.co.in"), "acmefab.co.in");
  assert.equal(websiteFromEmail("ca.office@mail.acme.com"), "acme.com");
  assert.equal(websiteFromEmail("someone@gmail.com"), null);
  assert.equal(websiteFromEmail("x@rediffmail.com"), null);
  assert.equal(websiteFromEmail(null), null);
});
