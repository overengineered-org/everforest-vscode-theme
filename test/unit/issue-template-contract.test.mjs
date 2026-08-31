import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { load as parseYaml } from "js-yaml";

const repositoryDirectory = resolve(import.meta.dirname, "../..");
const issueTemplateDirectory = resolve(repositoryDirectory, ".github/ISSUE_TEMPLATE");
const issueFormFileNames = readdirSync(issueTemplateDirectory)
  .filter((fileName) => /\.ya?ml$/i.test(fileName))
  .filter((fileName) => fileName !== "config.yml")
  .sort();

function readYamlFile(relativePath) {
  return parseYaml(readFileSync(resolve(repositoryDirectory, relativePath), "utf8"));
}

function readIssueForm(issueFormFileName) {
  return readYamlFile(`.github/ISSUE_TEMPLATE/${issueFormFileName}`);
}

function findIssueFormField(issueForm, fieldIdentifier) {
  return issueForm.body.find((issueFormItem) => issueFormItem?.id === fieldIdentifier);
}

function issueFormFieldText(issueFormItem) {
  return [
    issueFormItem?.id,
    issueFormItem?.attributes?.label,
    issueFormItem?.attributes?.description,
  ]
    .filter((fieldText) => typeof fieldText === "string")
    .join(" ");
}

function isPublicAttachmentArea(issueFormItem) {
  return (
    issueFormItem?.type === "textarea" &&
    /attachment|evidence|screenshot|recording|screen capture/i.test(
      issueFormFieldText(issueFormItem)
    )
  );
}

function hasSanitisationGuidance(issueFormItem) {
  const attachmentDescription = issueFormItem?.attributes?.description ?? "";
  return (
    /\bsanit(?:is|iz)(?:e|ed|ing|ation)?\b/i.test(attachmentDescription) ||
    /remove[\s\S]{0,160}\b(?:private|personal|sensitive|secret|token|credential)/i.test(
      attachmentDescription
    )
  );
}

test("parses every public issue form and uses unique field identifiers", () => {
  assert.ok(issueFormFileNames.length > 0, "at least one issue form must exist");

  for (const issueFormFileName of issueFormFileNames) {
    const issueForm = readIssueForm(issueFormFileName);

    assert.equal(typeof issueForm, "object", `${issueFormFileName} must parse as an object`);
    assert.equal(typeof issueForm.name, "string", `${issueFormFileName} needs a name`);
    assert.equal(
      typeof issueForm.description,
      "string",
      `${issueFormFileName} needs a description`
    );
    assert.ok(Array.isArray(issueForm.body), `${issueFormFileName} needs a form body`);

    const issueFormFieldIdentifiers = issueForm.body
      .map((issueFormItem) => issueFormItem?.id)
      .filter((fieldIdentifier) => fieldIdentifier !== undefined);
    assert.equal(
      new Set(issueFormFieldIdentifiers).size,
      issueFormFieldIdentifiers.length,
      `${issueFormFileName} field identifiers must be unique`
    );
  }
});

test("keeps the general support form environment and version fields exact", () => {
  const supportFormPath = resolve(issueTemplateDirectory, "support.yml");
  const supportForm = readYamlFile(".github/ISSUE_TEMPLATE/support.yml");
  assert.ok(
    readdirSync(issueTemplateDirectory).includes("support.yml"),
    `${supportFormPath} must exist`
  );

  const supportVersionFields = supportForm.body.filter(
    (issueFormItem) =>
      issueFormItem?.type === "input" && /version/i.test(issueFormItem.attributes?.label ?? "")
  );
  assert.deepEqual(supportVersionFields.map((issueFormItem) => issueFormItem.id).sort(), [
    "extension-version",
    "vscode-version",
  ]);

  assert.deepEqual(
    {
      type: findIssueFormField(supportForm, "extension-version")?.type,
      label: findIssueFormField(supportForm, "extension-version")?.attributes?.label,
      required: findIssueFormField(supportForm, "extension-version")?.validations?.required,
    },
    { type: "input", label: "Everforest Complete version", required: true }
  );
  assert.deepEqual(
    {
      type: findIssueFormField(supportForm, "vscode-version")?.type,
      label: findIssueFormField(supportForm, "vscode-version")?.attributes?.label,
      required: findIssueFormField(supportForm, "vscode-version")?.validations?.required,
    },
    { type: "input", label: "VS Code version", required: true }
  );
  assert.deepEqual(
    {
      type: findIssueFormField(supportForm, "environment")?.type,
      label: findIssueFormField(supportForm, "environment")?.attributes?.label,
      options: findIssueFormField(supportForm, "environment")?.attributes?.options,
      required: findIssueFormField(supportForm, "environment")?.validations?.required,
    },
    {
      type: "dropdown",
      label: "Environment",
      options: ["Desktop", "Remote window", "Browser-hosted VS Code"],
      required: true,
    }
  );
});

test("requires sanitisation guidance for every public attachment area", () => {
  const publicAttachmentAreas = issueFormFileNames.flatMap((issueFormFileName) =>
    readIssueForm(issueFormFileName)
      .body.filter(isPublicAttachmentArea)
      .map((issueFormItem) => ({ issueFormFileName, issueFormItem }))
  );
  assert.ok(publicAttachmentAreas.length > 0, "at least one attachment area must be declared");

  for (const { issueFormFileName, issueFormItem } of publicAttachmentAreas) {
    assert.ok(
      hasSanitisationGuidance(issueFormItem),
      `${issueFormFileName}:${issueFormItem.id} must explain how to sanitise attachments`
    );
  }
});

test("disables blank issues and keeps security and conduct routes separate", () => {
  const issueTemplateConfig = readYamlFile(".github/ISSUE_TEMPLATE/config.yml");
  assert.equal(issueTemplateConfig.blank_issues_enabled, false);

  const securityContactLink = issueTemplateConfig.contact_links?.find((contactLink) =>
    /security/i.test(contactLink?.name ?? "")
  );
  assert.ok(securityContactLink, "a security contact link must exist");
  assert.equal(
    securityContactLink.url,
    "https://github.com/overengineered-org/everforest-vscode-theme/security/advisories/new"
  );
  assert.match(securityContactLink.about ?? "", /private|confidential/i);

  const codeOfConduct = readFileSync(resolve(repositoryDirectory, "CODE_OF_CONDUCT.md"), "utf8");
  assert.match(codeOfConduct, /github\.com\/contact\/report-abuse/i);
  assert.match(codeOfConduct, /issues\/new\/choose/i);
  assert.doesNotMatch(codeOfConduct, /security\/advisories|security advisory/i);
});
