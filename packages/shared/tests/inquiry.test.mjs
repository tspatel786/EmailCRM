import assert from "node:assert/strict";
import test from "node:test";
import {
  findDuplicateContact,
  indianMobileVariants,
  normalizeIndianMobile,
  publicInquirySchema,
  stripHtml,
} from "../dist/inquiry.js";

test("stripHtml removes tags and normalizes whitespace", () => {
  assert.equal(stripHtml("<script>alert(1)</script>Hello <b>World</b>"), "alert(1) Hello World");
  assert.equal(stripHtml("  Plain   Text  "), "Plain Text");
});

test("normalizeIndianMobile handles 10-digit, +91, 0 prefix, and rejects invalid numbers", () => {
  assert.equal(normalizeIndianMobile("9876543210"), "9876543210");
  assert.equal(normalizeIndianMobile("+91 98765-43210"), "9876543210");
  assert.equal(normalizeIndianMobile("09876543210"), "9876543210");
  assert.equal(normalizeIndianMobile("919876543210"), "9876543210");
  assert.equal(normalizeIndianMobile("1234567890"), null);
  assert.equal(normalizeIndianMobile("987654321"), null);
  assert.equal(normalizeIndianMobile("98765432101"), null);
});

test("publicInquirySchema validates required fields, strips HTML, and normalizes mobile", () => {
  const parsed = publicInquirySchema.parse({
    name: "  <b>Rahul</b> Patil  ",
    mobile: "+91 98765 43210",
    email: "  RAHUL@EXAMPLE.COM ",
    company: "<i>Patil</i> Enterprises",
    service: "Website",
    message: "<p>Need a business site</p>",
    consent: true,
    website_url: "",
  });

  assert.equal(parsed.name, "Rahul Patil");
  assert.equal(parsed.mobile, "9876543210");
  assert.equal(parsed.email, "rahul@example.com");
  assert.equal(parsed.company, "Patil Enterprises");
  assert.equal(parsed.service, "Website");
  assert.equal(parsed.message, "Need a business site");
  assert.equal(parsed.consent, true);
});

test("publicInquirySchema allows empty optional email, company, and message", () => {
  const parsed = publicInquirySchema.parse({
    name: "Sneha Kulkarni",
    mobile: "8765432109",
    email: "",
    company: "",
    service: "WhatsApp Bot",
    message: "",
    consent: true,
  });

  assert.equal(parsed.email, "");
  assert.equal(parsed.company, "");
  assert.equal(parsed.message, "");
});

test("publicInquirySchema rejects missing consent, invalid mobile, invalid email, and oversized fields", () => {
  const noConsent = publicInquirySchema.safeParse({
    name: "Test",
    mobile: "9876543210",
    service: "Website",
    consent: false,
  });
  assert.equal(noConsent.success, false);

  const badMobile = publicInquirySchema.safeParse({
    name: "Test",
    mobile: "5123456789",
    service: "Website",
    consent: true,
  });
  assert.equal(badMobile.success, false);

  const badEmail = publicInquirySchema.safeParse({
    name: "Test",
    mobile: "9876543210",
    email: "not-an-email",
    service: "Website",
    consent: true,
  });
  assert.equal(badEmail.success, false);

  const longMessage = publicInquirySchema.safeParse({
    name: "Test",
    mobile: "9876543210",
    service: "Website",
    message: "x".repeat(2001),
    consent: true,
  });
  assert.equal(longMessage.success, false);
});

test("findDuplicateContact matches active contact by email or normalized mobile and skips archived", () => {
  const contacts = [
    {
      id: "c-archived",
      company_id: null,
      full_name: "Archived User",
      primary_email: "archived@example.com",
      primary_phone: "9999999999",
      archived_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "c-1",
      company_id: "comp-1",
      full_name: "Amit Joshi",
      primary_email: "Amit@Example.com",
      primary_phone: "+91 98220 11223",
      archived_at: null,
    },
  ];

  assert.equal(findDuplicateContact(contacts, "amit@example.com", "7777777777")?.id, "c-1");
  assert.equal(findDuplicateContact(contacts, "", "9822011223")?.id, "c-1");
  assert.equal(findDuplicateContact(contacts, "archived@example.com", "9999999999"), null);
  assert.equal(findDuplicateContact(contacts, "new@example.com", "9123456789"), null);
});

test("indianMobileVariants includes formatted and unformatted forms", () => {
  const variants = indianMobileVariants("9876543210");
  assert.ok(variants.includes("9876543210"));
  assert.ok(variants.includes("+919876543210"));
  assert.ok(variants.includes("+91 98765 43210"));
});

