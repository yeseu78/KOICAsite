import fs from "node:fs";
import {
  combinationCopy,
  contentLensData,
  correctionLensData,
} from "./data.js";

const errors = [];
const appSource = fs.readFileSync("./app.js", "utf8");
const styleSource = fs.readFileSync("./styles.css", "utf8");
const correctionKeys = Object.keys(correctionLensData);
const contentKeys = Object.keys(contentLensData);

if (correctionKeys.length !== 4) errors.push("교정렌즈 개수가 4개가 아닙니다.");
if (contentKeys.length !== 5) errors.push("콘텐츠 분야 개수가 5개가 아닙니다.");

for (const correctionKey of correctionKeys) {
  for (const contentKey of contentKeys) {
    if (!combinationCopy[correctionKey]?.[contentKey]) {
      errors.push(`조합 문구 누락: ${correctionKey}/${contentKey}`);
    }
  }
}

for (const item of [
  ...Object.values(correctionLensData),
  ...Object.values(contentLensData),
]) {
  for (const key of ["image", "mainImage", "subImage"]) {
    if (item[key] && !fs.existsSync(item[key])) {
      errors.push(`이미지 누락: ${item[key]}`);
    }
  }
}

for (const feature of [
  'aria-pressed="${optionIndex === currentAnswerIndex}"',
  'data-action="copy-result"',
  'data-action="share-result"',
  'data-action="share-story"',
  'data-action="share-feed"',
  "createResultShareCard",
]) {
  if (!appSource.includes(feature)) errors.push(`기능 코드 누락: ${feature}`);
}

for (const feature of [".option-button.is-selected", "@keyframes lens-main-float", ".share-section"]) {
  if (!styleSource.includes(feature)) errors.push(`스타일 누락: ${feature}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `검증 완료: ${correctionKeys.length}개 교정렌즈 × ${contentKeys.length}개 분야 = ${correctionKeys.length * contentKeys.length}개 조합, 이미지 14개, 선택·공유 기능`,
);
