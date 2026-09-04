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
const expectedCorrectionDiagnostics = {
  cooperation: { cooperationDegree: "+2.0", cooperationProgress: 100, empathyAngle: 60, empathyProgress: 33 },
  case: { cooperationDegree: "+1.5", cooperationProgress: 75, empathyAngle: 120, empathyProgress: 67 },
  empathy: { cooperationDegree: "+1.0", cooperationProgress: 50, empathyAngle: 90, empathyProgress: 50 },
  participation: { cooperationDegree: "+0.5", cooperationProgress: 25, empathyAngle: 180, empathyProgress: 100 },
};
const expectedContentMatching = {
  education: { displayName: "배움렌즈", sensitivityLabel: "배움" },
  health: { displayName: "헬스렌즈", sensitivityLabel: "헬스" },
  water: { displayName: "샘물렌즈", sensitivityLabel: "샘물" },
  ict: { displayName: "테크렌즈", sensitivityLabel: "테크" },
  peace: { displayName: "평화렌즈", sensitivityLabel: "평화" },
};

if (correctionKeys.length !== 4) errors.push("교정렌즈 개수가 4개가 아닙니다.");
if (contentKeys.length !== 5) errors.push("콘텐츠 분야 개수가 5개가 아닙니다.");

for (const correctionKey of correctionKeys) {
  const expected = expectedCorrectionDiagnostics[correctionKey];
  const actual = correctionLensData[correctionKey].diagnostics;
  if (
    !expected ||
    actual?.cooperationDegree !== expected.cooperationDegree ||
    actual?.cooperationProgress !== expected.cooperationProgress ||
    actual?.empathyAngle !== expected.empathyAngle ||
    actual?.empathyProgress !== expected.empathyProgress ||
    !actual?.cooperationLevel ||
    !actual?.empathyRange ||
    !correctionLensData[correctionKey].interpretation ||
    !correctionLensData[correctionKey].nextFocus
  ) {
    errors.push(`교정렌즈 진단값 오류: ${correctionKey}`);
  }

  for (const contentKey of contentKeys) {
    if (!combinationCopy[correctionKey]?.[contentKey]) {
      errors.push(`조합 문구 누락: ${correctionKey}/${contentKey}`);
    }

    const content = contentLensData[contentKey];
    const resultText = `${correctionLensData[correctionKey].displayName} × ${content.displayName} / 협력도 ${actual?.cooperationDegree} / 공감 시야각 ${actual?.empathyAngle}° / ${content.matching?.sensitivityLabel} 감도 ${content.matching?.sensitivity}%`;
    if (resultText.includes("undefined")) {
      errors.push(`조합 결과값 누락: ${correctionKey}/${contentKey}`);
    }
  }
}

for (const contentKey of contentKeys) {
  const expected = expectedContentMatching[contentKey];
  const content = contentLensData[contentKey];
  if (
    !expected ||
    content.displayName !== expected.displayName ||
    content.matching?.sensitivityLabel !== expected.sensitivityLabel ||
    content.matching?.sensitivity !== 100
  ) {
    errors.push(`콘텐츠 렌즈 감도값 오류: ${contentKey}`);
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
  'data-metric="cooperation-degree"',
  'data-metric="empathy-angle"',
  'data-metric="content-sensitivity"',
  "협력도와 공감 시야각은 현재 ODA 인식을 분석한 교정렌즈 진단 결과예요.",
  "이 결과를 쉽게 말하면",
  "정답률이 아니라 선택 분야와 추천 콘텐츠가 정확히 일치한다는 뜻이에요.",
  "이제 무엇을 보면 좋을까요?",
  "home-mobile-figma-vector.svg",
  "home-mobile-figma-original-2x.png 2x",
  "home-mobile-figma-original-4x.png 4x",
]) {
  if (!appSource.includes(feature)) errors.push(`기능 코드 누락: ${feature}`);
}

for (const feature of [
  ".option-button.is-selected",
  "@keyframes lens-main-float",
  ".share-section",
  ".result-metric-grid",
  ".result-metric-help",
  ".result-at-a-glance",
  ".metric-scale",
  ".result-next-focus",
]) {
  if (!styleSource.includes(feature)) errors.push(`스타일 누락: ${feature}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `검증 완료: ${correctionKeys.length}개 교정렌즈 × ${contentKeys.length}개 분야 = ${correctionKeys.length * contentKeys.length}개 조합, 진단 지표 3개, 이미지 14개, 선택·공유 기능`,
);
