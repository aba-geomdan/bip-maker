import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vdubgrxwijydwfabwpnk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdWJncnh3aWp5ZHdmYWJ3cG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDk1ODgsImV4cCI6MjA5NzE4NTU4OH0.nqNO3vany3M6fzmG5BG6QVdvi8BW2UbhTDhxNnwvA88";
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SKEY = (k) => `bipmaker::${k}`;

const bipStore = {
  async get(key) {
    try {
      const r = await _sb.from("shared_store").select("value").eq("key", SKEY(key)).maybeSingle();
      if (r.error) { return null; }
      if (!r.data) return null;
      let v = r.data.value;
      // 컬럼이 text든 jsonb든, 이중 직렬화된 레거시 값이든 안전하게 역직렬화
      for (let i = 0; i < 2 && typeof v === "string"; i++) {
        const s = v.trim();
        if (s === "") return null;
        if (s[0] === "{" || s[0] === "[" || s[0] === '"') {
          try { v = JSON.parse(s); } catch (e) { break; }
        } else { break; } // 순수 문자열(예: adminHash)은 그대로
      }
      return v;
    } catch (e) { return null; }
  },
  async set(key, value) {
    try {
      // 항상 JSON 문자열로 저장 → 컬럼 타입과 무관하게 get에서 복원 가능
      const payload = typeof value === "string" ? value : JSON.stringify(value);
      const r = await _sb.from("shared_store").upsert({ key: SKEY(key), value: payload, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (r.error) { return null; }
      return { value };
    } catch (e) { return null; }
  },
};


/*
 * BIP Maker — 도전행동 평가·중재 앱 (검단ABA언어행동연구소)
 * 통합본 패턴 반영: 로고 · 저작권 · PBKDF2 인증 · 관리자 계정관리 · 선생님별 데이터 격리
 *
 * ※ 아티팩트 미리보기용: 저장은 앱 상태(메모리)로 처리.
 *   나중에 GitHub 배포 시 Supabase(vdubgrxwijydwfabwpnk)로 교체 예정.
 *   - 관리자: 모든 선생님 케이스 열람
 *   - 선생님: 관리자가 추가, 본인 케이스만 열람
 *   - AI: 기본 템플릿, 필요시에만 AI 보강 버튼(크레딧 절약)
 */

// ── 브랜드 팔레트 (통합본 기준) ─────────────────
const PK = "#F5A0B1", PKL = "#FFF0F3", PKD = "#D4728A";
const INK = "#3A2C30", MUTE = "#9A8A8F";
const COPYRIGHT = "© 검단ABA언어행동연구소 (민다혜). All rights reserved.";

const LOGO_B64 = "data:image/png;base64,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";

// ── PBKDF2 인증 (통합본과 동일) ─────────────────
const PBKDF2_ITER = 120000;
function _bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function _hexToBuf(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}
async function hashPasswordSecure(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? _hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    keyMaterial, 256
  );
  const saltOut = saltHex || _bufToHex(salt.buffer);
  return `pbkdf2$${PBKDF2_ITER}$${saltOut}$${_bufToHex(bits)}`;
}
async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (typeof storedHash === "string" && storedHash.startsWith("pbkdf2$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 4) return false;
    try {
      return (await hashPasswordSecure(password, parts[2])) === storedHash;
    } catch (e) { return false; }
  }
  return false;
}

const ADMIN_NAME = "민다혜";

// ══════════════════════════════════════════════
//  간접평가 척도 정의 (FAST · QABF · MAS)
//  각 척도: 문항 배열 + 기능(function) 매핑
// ══════════════════════════════════════════════

// ── FAST (16문항, 예/아니오/해당없음) ───────────
// 기능: 사회적정적강화(관심/선호물), 사회적부적강화(회피), 자동정적강화(감각), 자동부적강화(신체/통증)
const FAST = {
  id: "FAST",
  name: "FAST",
  fullName: "기능평가 선별검사 (Functional Analysis Screening Tool)",
  scale: "yn", // 예/아니오/해당없음
  functions: {
    social_pos: "사회적 정적강화 (관심·선호물)",
    social_neg: "사회적 부적강화 (회피·도피)",
    auto_pos: "자동 정적강화 (감각자극)",
    auto_neg: "자동 부적강화 (신체·통증)",
  },
  items: [
    { q: "대상자가 관심을 받지 않거나 보호자가 다른 사람에게 관심을 줄 때 문제행동이 발생하는가?", f: "social_pos" },
    { q: "선호하는 항목이나 활동에 대한 대상자의 요구가 거부되거나 이를 빼앗길 때 문제행동이 발생하는가?", f: "social_pos" },
    { q: "문제행동이 발생할 때, 보호자는 보통 대상자를 진정시키거나 선호하는 활동에 참여시키려 하는가?", f: "social_pos" },
    { q: "많은 관심을 받을 때 또는 좋아하는 활동을 자유롭게 이용할 수 있을 때 대상자는 보통 바르게 행동하는가?", f: "social_pos" },
    { q: "업무/학습활동을 수행하거나 활동에 참여하도록 요청받았을 때, 대상자는 주로 소란을 피우거나 저항하는가?", f: "social_neg" },
    { q: "업무/학습활동을 수행하거나 활동에 참여하도록 요청받았을 때 문제행동이 발생하는가?", f: "social_neg" },
    { q: "과제가 제시되고 있는 동안 문제행동이 일어난다면, 대상자는 대개 과제로부터 '쉬는 시간'을 가지게 되는가?", f: "social_neg" },
    { q: "아무것도 할 필요가 없을 때 대상자는 바르게 행동하는가?", f: "social_neg" },
    { q: "근처에 아무도 없거나 보고 있지 않아도 문제행동이 발생하는가?", f: "auto_pos" },
    { q: "여가활동이 가능한 경우에도 문제행동을 보이는가?", f: "auto_pos" },
    { q: "문제행동이 '자기 자극'의 한 형태로 나타나는가? (예: 손 흔들기, 빙글빙글 돌기 등)", f: "auto_pos" },
    { q: "감각자극 활동이 나타날 때 문제행동이 일어날 가능성이 적은가? (예: 클레이, 모래놀이 등)", f: "auto_pos" },
    { q: "문제행동은 며칠 동안 발생하다가 발생하지 않는 상황이 순환적으로 일어나는가?", f: "auto_neg" },
    { q: "귀 질환이나 알레르기와 같은 반복적인 고통스러운 질환을 가지고 있는가?", f: "auto_neg" },
    { q: "대상자가 아플 때 문제행동이 일어날 가능성이 더 높은가?", f: "auto_neg" },
    { q: "신체적인 문제를 경험하고 있고, 이런 문제가 치료된다면 문제행동은 대개 없어지는가?", f: "auto_neg" },
  ],
};

// ── QABF (25문항, X/0~3점, 5기능 각 5문항) ──────
const QABF = {
  id: "QABF",
  name: "QABF",
  fullName: "행동기능 설문지 (Questions About Behavioral Functions)",
  scale: "q0123", // X 해당없음 / 0 전혀아님 / 1 가끔 / 2 종종 / 3 자주
  functions: {
    attention: "관심습득",
    escape: "회피",
    nonsocial: "비사회적 (자기자극)",
    physical: "신체적 (고통)",
    tangible: "강화물습득",
  },
  items: [
    { q: "관심을 끌기 위해 행동을 보인다.", f: "attention" },              // 1
    { q: "일하는 상황이나 학습상황에서 벗어나기 위해 행동을 보인다.", f: "escape" }, // 2
    { q: "'자기자극'의 형태로 행동을 보인다.", f: "nonsocial" },             // 3
    { q: "아픔을 느낄 때 행동을 보인다.", f: "physical" },                   // 4
    { q: "좋아하는 장난감, 음식, 음료수와 같이 어떤 물건을 가지기 위해서 행동을 보인다.", f: "tangible" }, // 5
    { q: "꾸중을 듣기를 즐겨하기 때문에 행동을 보인다.", f: "attention" },    // 6
    { q: "옷 입기, 이 닦기, 일하기 등 어떤 과제를 수행하라고 했을 때 행동을 보인다.", f: "escape" }, // 7
    { q: "방 안에 아무도 없어도 혼자서 행동을 보인다.", f: "nonsocial" },     // 8
    { q: "평가대상자가 아플 때 더 많이 행동을 보인다.", f: "physical" },      // 9
    { q: "평가대상자로부터 어떤 물건들을 제거하면 행동을 보인다.", f: "tangible" }, // 10
    { q: "자신에게 관심을 끌기 위해 행동을 보인다.", f: "attention" },        // 11
    { q: "특정 과제를 수행하기 싫어서 행동을 보인다.", f: "escape" },         // 12
    { q: "아무것도 할 것이 없을 때 행동을 보인다.", f: "nonsocial" },         // 13
    { q: "무엇인가 물리적/신체적으로 자신을 귀찮게 할 때 행동을 보인다.", f: "physical" }, // 14
    { q: "평가대상자가 원하는 물건을 당신이 가지고 있을 때 행동을 보인다.", f: "tangible" }, // 15
    { q: "평가대상자가 당신의 반응을 보고 싶어서 행동을 보인다.", f: "attention" }, // 16
    { q: "다른 사람들로부터 혼자 있고 싶어서 행동을 보인다.", f: "escape" },   // 17
    { q: "주변의 상황을 무시하며 심하게 반복행동을 보인다.", f: "nonsocial" }, // 18
    { q: "신체적으로 불편할 때 행동을 보인다.", f: "physical" },              // 19
    { q: "평가대상자가 원하는 물건을 또래가 가지고 있을 때 행동을 보인다.", f: "tangible" }, // 20
    { q: "행동을 보일 때면 '여기 와서 나를 봐' '나를 바라봐'라고 이야기하는 것 같다.", f: "attention" }, // 21
    { q: "행동을 보일 때면 '혼자 내버려둬' '무엇을 하라고 하지 마'라고 이야기하는 것 같다.", f: "escape" }, // 22
    { q: "혼자 있어도 그 행동을 즐기는 것 같다.", f: "nonsocial" },          // 23
    { q: "행동을 통해서 평가대상자가 아프다는 것을 말하는 것 같다.", f: "physical" }, // 24
    { q: "행동을 보일 때 장난감, 음식, 특정 물건을 달라고 말하는 것 같다.", f: "tangible" }, // 25
  ],
};

// ── MAS (16문항, 0~6점, 4기능 각 4문항) ─────────
const MAS = {
  id: "MAS",
  name: "MAS",
  fullName: "동기사정척도 (Motivation Assessment Scale)",
  scale: "s0to6", // 0 전혀아님 ~ 6 언제나
  functions: {
    sensory: "감각추구",
    escape: "회피",
    attention: "관심얻기",
    tangible: "획득",
  },
  items: [
    { q: "위의 행동은 오랜 시간 혼자 있을 때 나타납니까?", f: "sensory" },        // 1
    { q: "주변에 아무도 없으면 아주 오랜 시간 동안 반복적으로 일어납니까?", f: "sensory" }, // 2
    { q: "위의 행동을 하는 것을 즐기는 것으로 보입니까? (소리, 냄새, 맛, 시각적 즐거움)", f: "sensory" }, // 3
    { q: "위의 행동이 발생할 때, 주위에서 일어나는 일을 의식하지 못합니까?", f: "sensory" }, // 4
    { q: "위의 행동은 어려운 과업 수행을 요구받을 때 일어납니까?", f: "escape" },   // 5
    { q: "위의 행동은 어떤 요구를 할 때 일어납니까?", f: "escape" },              // 6
    { q: "어떤 것을 요구할 때, 상대방을 당황스럽거나 화나게 하려고 위의 행동을 하는 것 같습니까?", f: "escape" }, // 7
    { q: "주어진 과제를 멈춘 후(1~5분 내) 위의 행동이 중지됩니까?", f: "escape" }, // 8
    { q: "위의 행동은 다른 사람들과 이야기하고 있을 때 일어납니까?", f: "attention" }, // 9
    { q: "위의 행동은 대상자에게서 관심을 다른 데로 돌릴 때 일어납니까?", f: "attention" }, // 10
    { q: "관심을 주지 않을 때, 상대방을 당황스럽거나 화나게 하려고 위의 행동을 하는 것 같습니까?", f: "attention" }, // 11
    { q: "상대방(타인)과 함께 시간을 보내기 위해 위의 행동을 하는 것 같습니까?", f: "attention" }, // 12
    { q: "위의 행동은 가질 수 없다고 알고 있는 물건, 음식, 활동 등을 얻고자 할 때 일어납니까?", f: "tangible" }, // 13
    { q: "위의 행동은 좋아하는 음식, 활동, 물건 등을 제거했을 때 일어납니까?", f: "tangible" }, // 14
    { q: "위의 행동은 요구 사항(물건, 음식, 활동 등)이 제공된 후에 짧게라도 행동이 멈추었습니까?", f: "tangible" }, // 15
    { q: "원하는 일을 할 수 없을 때 위의 행동을 하는 것 같습니까?", f: "tangible" }, // 16
  ],
};

const SCALES = { FAST, QABF, MAS };
const SCALE_LIST = [FAST, QABF, MAS];

// 응답 옵션 정의
const SCALE_OPTIONS = {
  yn: [
    { v: "yes", label: "예", score: 1 },
    { v: "no", label: "아니오", score: 0 },
    { v: "na", label: "해당없음", score: null },
  ],
  q0123: [
    { v: "x", label: "X", score: null, hint: "해당없음" },
    { v: "0", label: "0", score: 0, hint: "전혀아님" },
    { v: "1", label: "1", score: 1, hint: "가끔" },
    { v: "2", label: "2", score: 2, hint: "종종" },
    { v: "3", label: "3", score: 3, hint: "자주" },
  ],
  s0to6: [
    { v: "0", label: "0", score: 0, hint: "전혀아님" },
    { v: "1", label: "1", score: 1, hint: "거의아님" },
    { v: "2", label: "2", score: 2, hint: "가끔" },
    { v: "3", label: "3", score: 3, hint: "중간" },
    { v: "4", label: "4", score: 4, hint: "대부분" },
    { v: "5", label: "5", score: 5, hint: "거의" },
    { v: "6", label: "6", score: 6, hint: "언제나" },
  ],
};

// ── 채점 함수: 응답 → 기능별 점수·순위 ──────────
function scoreAssessment(scaleId, answers) {
  const scale = SCALES[scaleId];
  const opts = SCALE_OPTIONS[scale.scale];
  const byFunc = {}; // f -> {sum, count}
  Object.keys(scale.functions).forEach((f) => (byFunc[f] = { sum: 0, count: 0 }));

  scale.items.forEach((item, i) => {
    const ans = answers[i];
    if (ans == null || ans === "") return;
    const opt = opts.find((o) => o.v === ans);
    if (!opt || opt.score == null) return; // 해당없음/X 제외
    byFunc[item.f].sum += opt.score;
    byFunc[item.f].count += 1;
  });

  // 기능별 결과 (합계 + 평균)
  const results = Object.keys(scale.functions).map((f) => ({
    f,
    name: scale.functions[f],
    sum: byFunc[f].sum,
    count: byFunc[f].count,
    avg: byFunc[f].count ? byFunc[f].sum / byFunc[f].count : 0,
  }));

  // 순위: 합계 기준 내림차순 (MAS는 평균도 참고하지만 합계로 통일)
  const sorted = [...results].sort((a, b) => b.sum - a.sum);
  const top = sorted[0];
  return { results, sorted, top };
}

// ══════════════════════════════════════════════
//  기능 통합 매핑 + 중재 라이브러리 (템플릿 기반)
//  세 척도의 개별 기능 → 4대 공통기능으로 수렴
// ══════════════════════════════════════════════
// 공통기능: attention(관심) / escape(회피) / sensory(감각·자동) / tangible(획득)
const FUNC_UNIFY = {
  // FAST
  social_pos: "attention", social_neg: "escape", auto_pos: "sensory", auto_neg: "sensory",
  // QABF
  attention: "attention", escape: "escape", nonsocial: "sensory", physical: "sensory", tangible: "tangible",
  // MAS
  sensory: "sensory",
  // (attention/escape/tangible 은 위와 키 공유)
};
const UNIFIED_FUNC_NAME = {
  attention: "관심 끌기 (사회적 정적강화)",
  escape: "회피·도피 (사회적 부적강화)",
  sensory: "감각 자극 (자동강화)",
  tangible: "선호물 획득 (물질적 강화)",
};

// 기능 계층 라벨/색상 (1차/2차/별도)
const TIER_LABEL = { primary: "1차 기능", secondary: "2차 기능", tertiary: "별도 기능", minor: "경미" };
const TIER_COLOR = { primary: "#D4728A", secondary: "#E89AAC", tertiary: "#8AA9D6", minor: "#C9BCC0" };

// 기능별 한 줄 가설 (계층 표시용)
const FUNC_HYPOTHESIS_SHORT = {
  attention: "관심이 부족할 때 관심을 얻으려는 동기",
  escape: "비선호 활동·요구에서 벗어나려는 동기",
  sensory: "특정 감각자극 자체가 주는 만족을 추구하는 동기",
  tangible: "원하는 물건·활동을 얻으려는 동기",
};

// 행동의 의미 서술 (임상적 재해석)
function FUNC_MEANING(func, name, target, setting) {
  const who = name || "아동";
  const place = setting === "school" ? "학급" : "치료 상황";
  const base = {
    attention: `${who}의 도전적 행동은 통제 불능의 돌발행동이 아니라, "나에게 관심을 주세요"라는 의사를 적절한 방식으로 전달하지 못한 채 강도 높은 행동으로 표현하는 학습된 기능적 의사소통의 대체 수단입니다.`,
    escape: `${who}의 도전적 행동은 통제 불능의 돌발행동이 아니라, "이 활동을 하고 싶지 않다"는 거절·회피 의사를 적절한 방식으로 전달하지 못한 채 강도 높은 행동으로 표현하는 학습된 기능적 의사소통의 대체 수단입니다.`,
    sensory: `${who}의 도전적 행동은 문제 삼아야 할 '나쁜 버릇'이 아니라, 충족되지 못한 감각 욕구가 겉으로 드러난 신호입니다. 안전하고 수용 가능한 대체 감각활동을 제공하면 조절 가능한 행동입니다.`,
    tangible: `${who}의 도전적 행동은 통제 불능의 돌발행동이 아니라, "그것을 갖고 싶다·하고 싶다"는 요구를 적절한 방식으로 전달하지 못한 채 강도 높은 행동으로 표현하는 학습된 기능적 의사소통의 대체 수단입니다.`,
  };
  return `${base[func] || base.escape} 적절한 대체행동 교수와 강화 수반성 재설정을 통해 ${place}에서 충분히 변화 가능한 표적행동입니다.`;
}


// 기능별 중재 라이브러리 — ABA 표준 4구성
const INTERVENTION_LIB = {
  attention: {
    hypothesis: (name, beh) => `${name}은(는) 주변 어른이나 또래의 관심이 부족할 때 ${beh}을(를) 통해 관심을 얻으려는 것으로 추정됩니다. 즉, 이 행동은 '나를 봐 주세요'라는 기능을 합니다.`,
    antecedent: [
      "규칙적인 관심 제공: 문제행동이 없을 때 미리, 자주(예: 5~10분마다) 긍정적 관심을 준다 (비유관 관심, NCR).",
      "활동 시작 전 '지금부터 5분 동안 혼자 해보고, 다 하면 선생님이 크게 칭찬해줄게'처럼 관심을 받을 수 있는 시점을 예고한다.",
      "아동이 바르게 행동하는 순간을 놓치지 않고 즉시 언급해 준다 (행동 특정적 칭찬).",
    ],
    replacement: [
      "관심을 적절히 요청하는 방법을 가르친다 (예: 손 들기, '봐 주세요' 말하기, 도움카드 건네기 — 기능적 의사소통 훈련 FCT).",
      "적절한 요청에는 즉각적이고 풍부하게 반응해, 새 행동이 문제행동보다 '더 빠르고 확실하게' 관심을 얻도록 한다.",
    ],
    consequence: [
      "문제행동에는 계획된 무관심(소거)을 적용한다 — 눈맞춤·말·표정 반응을 최소화한다. (단, 안전이 위협되면 최소한의 중립적 개입)",
      "적절한 관심요청 행동에는 즉시 관심으로 반응한다 (차별강화 DRA).",
      "문제행동이 멈추고 잠시 후 적절 행동이 나올 때 관심을 준다 (타행동 차별강화 DRO).",
    ],
  },
  escape: {
    hypothesis: (name, beh) => `${name}은(는) 어렵거나 하기 싫은 과제·요구가 제시될 때 그 상황에서 벗어나기 위해 ${beh}을(를) 보이는 것으로 추정됩니다. 즉, 이 행동은 '이걸 그만하고 싶어요'라는 기능을 합니다.`,
    antecedent: [
      "과제 난이도를 아동 수준에 맞게 조정하고, 성공 경험을 먼저 제공한다 (행동 탄력, behavioral momentum: 쉬운 과제 → 어려운 과제).",
      "과제를 짧게 나누고 중간에 계획된 휴식을 미리 제공한다.",
      "선택 기회를 준다 (예: '수학 먼저 할래, 읽기 먼저 할래?').",
      "시각적 일정표로 과제의 시작과 끝, 쉬는 시간을 예측 가능하게 한다.",
    ],
    replacement: [
      "적절하게 휴식·도움을 요청하는 방법을 가르친다 (예: '쉬고 싶어요' 카드, '도와주세요' 말하기 — FCT).",
      "요청 시 즉시 짧은 휴식이나 도움을 제공해, 새 행동이 문제행동보다 효율적으로 회피 기능을 하도록 한다.",
    ],
    consequence: [
      "문제행동으로는 과제에서 벗어나지 못하게 한다 (소거: 문제행동 후에도 과제 지속, escape extinction).",
      "적절한 요청이나 과제 참여에는 즉시 휴식·강화를 제공한다 (DRA).",
      "정해진 양의 과제를 완수하면 선호 활동을 제공한다 (프리맥 원리).",
    ],
  },
  sensory: {
    hypothesis: (name, beh) => `${name}의 ${beh}은(는) 특정 감각적 자극 자체가 주는 만족 때문에 유지되는 것으로 추정됩니다(자동강화). 주변에 사람이 없어도 나타나는 경향이 이를 뒷받침합니다.`,
    antecedent: [
      "유사한 감각을 주는 적절한 대체 활동을 환경에 풍부하게 배치한다 (환경 풍요화, 예: 촉각 놀잇감, 씹기 도구).",
      "선호 감각활동을 정해진 시간에 계획적으로 제공한다 (비유관 감각자극 제공).",
      "일과 중 감각 욕구가 충족되는 시간을 미리 확보한다 (감각 식단, sensory diet).",
    ],
    replacement: [
      "사회적으로 수용 가능하고 유사한 감각을 얻는 대체행동을 가르친다 (예: 손 흔들기 → 피젯토이 조작).",
      "대체행동이 문제행동만큼 혹은 그 이상으로 감각 만족을 주도록 조정한다.",
    ],
    consequence: [
      "가능한 경우 감각 자극을 차단·감소시킨다 (감각 소거, 예: 보호장비·환경 수정 — 안전 범위 내에서).",
      "대체 감각활동에 참여할 때 강화한다 (DRA).",
      "문제행동이 없는 시간 간격에 강화를 제공한다 (DRO). ※ 자동강화는 소거가 어려우므로 대체행동과 환경조정이 핵심.",
    ],
  },
  tangible: {
    hypothesis: (name, beh) => `${name}은(는) 원하는 물건·음식·활동을 얻지 못하거나 빼앗겼을 때 이를 얻기 위해 ${beh}을(를) 보이는 것으로 추정됩니다. 즉, '그걸 갖고 싶어요'라는 기능을 합니다.`,
    antecedent: [
      "선호물 이용 규칙과 시간을 시각적으로 미리 안내한다 (예: 타이머, '이따가' 카드).",
      "전이(선호물 종료) 전에 예고하고, 다음에 다시 할 수 있음을 알려준다.",
      "선호물을 요청할 수 있는 적절한 기회를 자주 만든다.",
    ],
    replacement: [
      "원하는 것을 적절히 요청하는 방법을 가르친다 (예: 그림교환 PECS, '주세요' 말하기 — FCT).",
      "적절한 요청 시 가능한 범위에서 즉시 제공하거나, '기다리기'를 단계적으로 가르친다 (지연 감내 훈련).",
    ],
    consequence: [
      "문제행동으로는 원하는 물건을 얻지 못하게 한다 (소거).",
      "적절한 요청에는 즉시 선호물을 제공한다 (DRA).",
      "정해진 시간 동안 문제행동 없이 기다리면 선호물을 제공한다 (DRO·지연강화).",
    ],
  },
};

// ══════════════════════════════════════════════
//  학교(PBS) 전용 중재 라이브러리
//  전제: 교사 1명이 학급 전체 담당 → 1:1 개별교수·즉각개입 어려움
//  → 선행중재(예방)·환경세팅·또래/학급차원·자기관리 중심으로 구성
// ══════════════════════════════════════════════
const INTERVENTION_LIB_SCHOOL = {
  attention: {
    hypothesis: (name, beh) => `${name}은(는) 교실에서 교사나 또래의 관심이 부족할 때 ${beh}을(를) 통해 관심을 얻으려는 것으로 추정됩니다. 학급 전체를 지도하는 교사가 개별 관심을 주기 어려운 상황이 이 행동을 강화할 수 있습니다.`,
    antecedent: [
      "수업 중 정기적으로 관심을 주는 시점을 미리 정한다 (예: 순회지도 동선에 이 학생 좌석을 포함, 활동 전환마다 짧게 눈맞춤·격려).",
      "교사와 가까운 좌석에 배치하고, 바르게 참여할 때 자연스럽게 관심을 받을 수 있게 한다.",
      "'도우미 역할'(칠판 정리, 유인물 배부 등)을 부여해 적절한 방식으로 관심·인정을 얻을 기회를 만든다.",
      "1:1 개별 개입이 어려우므로, 학급 전체 규칙에 '바르게 참여하면 관심' 원칙을 포함해 예측 가능하게 한다.",
    ],
    replacement: [
      "관심이 필요할 때 적절히 요청하는 방법을 가르친다 (예: 도움 요청 카드 책상에 부착, 손 들기, 정해진 신호).",
      "또래 짝(버디)을 지정해, 교사가 즉시 반응하지 못할 때 또래의 긍정적 관심으로 보완한다 (또래 매개 지원).",
    ],
    consequence: [
      "문제행동에는 최소한의 반응(계획된 무관심)을 하되, 학급 흐름이 끊기지 않게 비언어적 신호로 처리한다.",
      "바르게 참여하는 순간을 놓치지 않고 즉시 구체적으로 칭찬한다 (행동 특정적 칭찬 — 학급 전체에도 모델이 됨).",
      "개별 즉각강화가 어려우므로, 토큰·스티커판 같은 시각적 누적강화로 지연강화를 운영한다.",
    ],
  },
  escape: {
    hypothesis: (name, beh) => `${name}은(는) 수업 과제가 어렵거나 길게 느껴질 때 그 상황에서 벗어나기 위해 ${beh}을(를) 보이는 것으로 추정됩니다. 개별 난이도 조정이 어려운 학급 수업 특성상 회피 동기가 커질 수 있습니다.`,
    antecedent: [
      "과제를 작은 단위로 나누고, 완료 지점을 시각적으로 표시한다 (예: 체크리스트, '여기까지' 표시).",
      "이 학생에게는 분량·난이도를 사전에 조정한 과제를 준비한다 (수정된 과제, 또래와 다른 양이어도 무방).",
      "수업 일과와 과제 순서를 시각적 일정표로 제시해 예측 가능성을 높인다.",
      "쉬운 과제로 시작해 성공 경험을 준 뒤 어려운 과제로 넘어간다 (행동 탄력).",
      "정해진 조건에서 '휴식 패스'를 쓸 수 있게 한다 (교실 안에서 합법적으로 잠깐 쉬는 방법).",
    ],
    replacement: [
      "적절히 도움·휴식을 요청하는 방법을 가르친다 (예: '도와주세요/쉬고 싶어요' 카드, 책상 위 신호판).",
      "요청 시 짧은 휴식이나 대안 과제를 허용해, 문제행동보다 요청이 더 쉽게 통하도록 만든다.",
    ],
    consequence: [
      "가능한 범위에서 문제행동으로 과제를 완전히 회피하지는 못하게 한다 (예: 양을 줄여서라도 최소한 참여 후 종료).",
      "적절한 요청·참여에는 즉시 휴식·강화를 준다 (DRA).",
      "정해진 분량을 마치면 선호 활동을 하게 한다 (프리맥 — 학급 공통 규칙으로 운영하면 관리 쉬움).",
      "일관된 소거가 어려운 환경이므로, 교사·특수교사·보조인력이 대응 방식을 미리 통일해 둔다.",
    ],
  },
  sensory: {
    hypothesis: (name, beh) => `${name}의 ${beh}은(는) 특정 감각자극 자체가 주는 만족 때문에 유지되는 것으로 추정됩니다(자동강화). 수업 중 자극이 단조롭거나 대기 시간이 길 때 더 나타날 수 있습니다.`,
    antecedent: [
      "수업 중 사용할 수 있는 조용한 감각도구를 허용한다 (예: 피젯토이, 무릎담요, 씹기 목걸이 — 수업 방해 없는 것으로).",
      "대기·전이 시간을 줄이고, 할 일을 명확히 주어 '빈 시간'을 최소화한다.",
      "쉬는 시간이나 정해진 시점에 감각욕구를 충분히 충족할 기회를 준다 (감각 식단).",
      "좌석 위치·조명·소음 등 교실 환경에서 과잉/과소 자극 요인을 조정한다.",
    ],
    replacement: [
      "수업에 방해되지 않으면서 비슷한 감각을 얻는 대체행동을 가르친다 (예: 소리내기 → 피젯 조작, 자리이탈 → 정해진 스트레칭).",
      "감각도구 사용 규칙(언제·어떻게)을 명확히 정해 자기관리로 연결한다.",
    ],
    consequence: [
      "자동강화는 소거가 어려우므로, 환경조정과 대체도구가 핵심임을 교사와 공유한다.",
      "대체도구를 적절히 사용할 때 인정·강화한다 (DRA).",
      "문제행동이 적은 시간대·상황을 파악해, 그 조건을 수업 전반으로 확대 적용한다.",
    ],
  },
  tangible: {
    hypothesis: (name, beh) => `${name}은(는) 원하는 물건·활동을 얻지 못하거나 순서를 기다려야 할 때 ${beh}을(를) 보이는 것으로 추정됩니다. 학급에서는 자원(교구·컴퓨터·차례)이 공유되므로 이런 상황이 자주 생깁니다.`,
    antecedent: [
      "차례·이용 규칙을 시각적으로 명확히 안내한다 (예: 순서판, 타이머, '다음은 내 차례' 카드).",
      "전이(활동 종료) 전에 예고하고, 다음 이용 시점을 알려준다.",
      "선호 물건·활동을 적절히 요청하거나 차례를 기다릴 기회를 자주 만든다.",
      "공유 자원은 순번표·시간표로 구조화해 갈등 상황 자체를 예방한다.",
    ],
    replacement: [
      "원하는 것을 적절히 요청하고 기다리는 방법을 가르친다 (예: 요청 카드, '기다리기' 시각 타이머).",
      "짧은 기다림부터 점차 늘려 지연을 견디는 힘을 기른다 (지연 감내 훈련).",
    ],
    consequence: [
      "문제행동으로는 원하는 것을 얻지 못하게 하되, 학급 규칙으로 일관되게 적용한다.",
      "적절한 요청·기다림에는 약속대로 선호물·차례를 제공한다 (DRA).",
      "차례를 잘 지키거나 기다린 것을 학급 차원에서 인정·강화한다 (집단강화로 관리 부담 완화).",
    ],
  },
};

// 완료된 평가들 → 통합 기능 집계 (가장 우세한 기능 판정)
function aggregateFunction(assessments) {
  if (!assessments || assessments.length === 0) return null;
  const tally = { attention: 0, escape: 0, sensory: 0, tangible: 0 }; // 1위 표수(기존 호환)
  const scoreSum = { attention: 0, escape: 0, sensory: 0, tangible: 0 }; // 정규화 점수 합
  const detail = []; // 각 평가별 top 기능

  assessments.forEach((a) => {
    // 1위 기능 집계 (기존 호환)
    const uf = FUNC_UNIFY[a.top.f];
    if (uf) { tally[uf] += 1; detail.push({ scale: a.scaleId, func: uf, raw: a.top.name }); }

    // 모든 기능 점수를 통합축으로 합산 (정규화: 각 평가 내 최고점=1 기준)
    if (a.results && a.results.length) {
      const maxSum = Math.max(...a.results.map((r) => r.sum), 1);
      a.results.forEach((r) => {
        const u = FUNC_UNIFY[r.f];
        if (u) scoreSum[u] += r.sum / maxSum; // 0~1 정규화 후 누적
      });
    }
  });

  const ranked = Object.entries(tally).sort((x, y) => y[1] - x[1]);
  const primary = ranked[0][1] > 0 ? ranked[0][0] : null;

  // 점수 기반 순위 (1차/2차/별도 계층 판정용)
  const scoreRanked = Object.entries(scoreSum)
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1]);

  // 계층 분류: 최고점 대비 비율로 판정
  const topScore = scoreRanked.length ? scoreRanked[0][1] : 0;
  const tiers = scoreRanked.map(([f, v], i) => {
    let tier;
    if (i === 0) tier = "primary";
    else if (v >= topScore * 0.6) tier = "secondary"; // 최고의 60% 이상이면 부기능
    else if (v >= topScore * 0.3) tier = "tertiary";  // 30~60%면 별도기능
    else tier = "minor";
    return { func: f, score: v, ratio: topScore ? v / topScore : 0, tier };
  });

  return { primary, tally, detail, ranked, scoreSum, scoreRanked, tiers, topScore };
}

// BIP 생성 (템플릿 조합) — setting: 'center' | 'pbs'
function generateBIP(func, childName, targetBeh, setting) {
  const lib = (setting === "pbs" ? INTERVENTION_LIB_SCHOOL : INTERVENTION_LIB)[func];
  if (!lib) return null;
  const name = childName || "아동";
  const beh = targetBeh || "목표행동";
  return {
    func,
    funcName: UNIFIED_FUNC_NAME[func],
    setting: setting === "pbs" ? "school" : "center",
    hypothesis: lib.hypothesis(name, beh),
    antecedent: lib.antecedent,
    replacement: lib.replacement,
    consequence: lib.consequence,
  };
}

export default function App() {
  // 인증 상태
  const [adminHash, setAdminHash] = useState(null); // 관리자 비번 해시 (null = 미설정)
  const [teachers, setTeachers] = useState([]);       // [{name, hash}]
  const [current, setCurrent] = useState(null);       // {role:'admin'|'teacher', name}
  const didRestoreSession = React.useRef(false);

  // 데이터 (Supabase 로드)
  const [cases, setCases] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const didHydrate = React.useRef(false);
  const hadCasesAtLoad = React.useRef(false);
  const hadTeachersAtLoad = React.useRef(false);

  const [tab, setTab] = useState("center");
  const [selectedId, setSelectedId] = useState(null); // 열람 중인 케이스 id

  useEffect(() => {
    (async () => {
      const [ah, tc, cs] = await Promise.all([
        bipStore.get("adminHash"),
        bipStore.get("teachers"),
        bipStore.get("cases"),
      ]);
      if (ah) setAdminHash(ah);
      if (Array.isArray(tc)) { setTeachers(tc); hadTeachersAtLoad.current = tc.length > 0; }
      if (Array.isArray(cs)) { setCases(cs); hadCasesAtLoad.current = cs.length > 0; }
      didHydrate.current = true;
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (didHydrate.current && adminHash) bipStore.set("adminHash", adminHash); }, [adminHash]);
  useEffect(() => {
    if (!didHydrate.current) return;
    if (teachers.length === 0 && hadTeachersAtLoad.current) return; // 비정상 빈 배열 덮어쓰기 방지
    bipStore.set("teachers", teachers);
  }, [teachers]);
  useEffect(() => {
    if (!didHydrate.current) return;
    if (cases.length === 0 && hadCasesAtLoad.current) return; // 비정상 빈 배열 덮어쓰기 방지
    bipStore.set("cases", cases);
  }, [cases]);

  useEffect(() => {
    try { const r = localStorage.getItem("bipmaker-current"); if (r) setCurrent(JSON.parse(r)); } catch (e) {}
    didRestoreSession.current = true;
  }, []);
  useEffect(() => {
    if (!didRestoreSession.current) return;
    if (current) { try { localStorage.setItem("bipmaker-current", JSON.stringify(current)); } catch (e) {} }
  }, [current]);


  // 로그인 전
  if (!current) {
    return (
      <AuthGate
        adminHash={adminHash}
        teachers={teachers}
        onSetupAdmin={async (pw) => {
          const h = await hashPasswordSecure(pw);
          setAdminHash(h);
        }}
        onLogin={setCurrent}
      />
    );
  }

  const handleLogout = () => {
    try { localStorage.removeItem("bipmaker-current"); } catch (e) {}
    setCurrent(null);
  };

  const isAdmin = current.role === "admin";
  // 관리자는 전체, 선생님은 본인 owner만
  const visible = cases.filter((c) => c.type === tab && (isAdmin || c.owner === current.name));

  const selectedCase = selectedId ? cases.find((c) => c.id === selectedId) : null;

  // 기록 추가/삭제 헬퍼
  const addRecord = (caseId, rec) =>
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, records: [{ ...rec, id: Date.now() }, ...(c.records || [])] } : c));
  const removeRecord = (caseId, recId) =>
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, records: (c.records || []).filter((r) => r.id !== recId) } : c));

  // 평가 추가/삭제 헬퍼
  const addAssessment = (caseId, asmt) =>
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, assessments: [{ ...asmt, id: Date.now() }, ...(c.assessments || [])] } : c));
  const removeAssessment = (caseId, asmtId) =>
    setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, assessments: (c.assessments || []).filter((a) => a.id !== asmtId) } : c));

  // 케이스 삭제
  const removeCase = (caseId) => {
    setCases((prev) => {
      const next = prev.filter((c) => c.id !== caseId);
      hadCasesAtLoad.current = next.length > 0; // 의도적 삭제로 0개가 되면 이후 자동저장 허용
      bipStore.set("cases", next);              // 빈 배열이어도 명시적으로 저장
      return next;
    });
    setSelectedId(null);
  };

  // 상세 화면
  if (selectedCase) {
    return (
      <div style={{ minHeight: "100vh", background: PKL, fontFamily: "'Pretendard', -apple-system, sans-serif", color: INK, display: "flex", flexDirection: "column" }}>
        <Header current={current} isAdmin={isAdmin} onLogout={handleLogout} />
        <div style={{ flex: 1, maxWidth: 860, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "0 16px 40px" }}>
          <CaseDetail
            c={selectedCase}
            isAdmin={isAdmin}
            onBack={() => setSelectedId(null)}
            onAddRecord={(rec) => addRecord(selectedCase.id, rec)}
            onRemoveRecord={(recId) => removeRecord(selectedCase.id, recId)}
            onAddAssessment={(asmt) => addAssessment(selectedCase.id, asmt)}
            onRemoveAssessment={(aid) => removeAssessment(selectedCase.id, aid)}
            onRemoveCase={() => removeCase(selectedCase.id)}
          />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: PKL, fontFamily: "'Pretendard', -apple-system, sans-serif", color: INK, display: "flex", flexDirection: "column" }}>
      <Header current={current} isAdmin={isAdmin} onLogout={handleLogout} />

      <div style={{ flex: 1, maxWidth: 860, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "0 16px 40px" }}>
        {isAdmin && (
          <AdminPanel
            teachers={teachers}
            onAddTeacher={async (name, pw) => {
              const h = await hashPasswordSecure(pw);
              setTeachers((prev) => [...prev.filter((t) => t.name !== name), { name, hash: h }]);
            }}
            onRemoveTeacher={(name) => setTeachers((prev) => prev.filter((t) => t.name !== name))}
          />
        )}

        <div style={{ display: "flex", gap: 8, margin: "18px 0" }}>
          <TabBtn active={tab === "center"} onClick={() => setTab("center")}>
            센터 아동 <Badge>{cases.filter((c) => c.type === "center" && (isAdmin || c.owner === current.name)).length}</Badge>
          </TabBtn>
          <TabBtn active={tab === "pbs"} onClick={() => setTab("pbs")}>
            PBS 아동 <Badge>{cases.filter((c) => c.type === "pbs" && (isAdmin || c.owner === current.name)).length}</Badge>
          </TabBtn>
        </div>

        <CaseList
          tab={tab}
          isAdmin={isAdmin}
          cases={visible}
          onSelect={(id) => setSelectedId(id)}
          onAdd={(nc) => setCases((prev) => { hadCasesAtLoad.current = true; return [...prev, { ...nc, id: Date.now(), type: tab, owner: current.name, createdAt: today(), records: [], assessments: [] }]; })}
        />
      </div>

      <Footer />
    </div>
  );
}

// ── 인증 게이트: 최초 관리자 설정 / 로그인 ───────
function AuthGate({ adminHash, teachers, onSetupAdmin, onLogin }) {
  const needSetup = !adminHash;
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const doSetup = async () => {
    if (pw.length < 4) return setErr("비밀번호는 4자 이상이어야 해요.");
    if (pw !== pw2) return setErr("비밀번호가 서로 달라요.");
    setBusy(true);
    await onSetupAdmin(pw);
    setBusy(false);
    setPw(""); setPw2(""); setErr("");
  };

  const doLogin = async () => {
    setErr(""); setBusy(true);
    try {
      if (name.trim() === ADMIN_NAME) {
        if (await verifyPassword(pw, adminHash)) return onLogin({ role: "admin", name: ADMIN_NAME });
        return setErr("관리자 비밀번호가 맞지 않아요.");
      }
      const t = teachers.find((x) => x.name === name.trim());
      if (t && (await verifyPassword(pw, t.hash))) return onLogin({ role: "teacher", name: t.name });
      setErr("이름 또는 비밀번호가 맞지 않아요.");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${PKL} 0%, #fff 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', -apple-system, sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 370, background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 12px 40px rgba(212,114,138,0.15)" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ width: 60, height: 60, margin: "0 auto 10px", borderRadius: 15, background: PKL, border: `2px solid ${PK}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <img src={LOGO_B64} alt="검단ABA언어행동연구소 로고" style={{ width: "82%", height: "82%", objectFit: "contain" }} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, color: INK }}>BIP Maker</div>
          <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>도전행동 평가 · 중재 도구</div>
        </div>

        {needSetup ? (
          <>
            <div style={{ background: PKL, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: PKD, marginBottom: 16, lineHeight: 1.5 }}>
              🔒 <b>처음 사용</b>이시군요! 관리자(센터장) 비밀번호를 먼저 설정해 주세요.
            </div>
            <Field label="새 관리자 비밀번호 (4자 이상)" value={pw} onChange={setPw} type="password" placeholder="비밀번호" />
            <Field label="비밀번호 확인" value={pw2} onChange={setPw2} type="password" placeholder="다시 입력" onEnter={doSetup} />
            {err && <div style={{ color: PKD, fontSize: 12, marginBottom: 8 }}>{err}</div>}
            <button onClick={doSetup} disabled={busy} style={{ ...btnPrimary, width: "100%", marginTop: 6, opacity: busy ? 0.6 : 1 }}>
              {busy ? "설정 중..." : "관리자 비밀번호 설정"}
            </button>
          </>
        ) : (
          <>
            <Field label="이름" value={name} onChange={setName} placeholder="이름 (센터장은 '민다혜')" />
            <Field label="비밀번호" value={pw} onChange={setPw} type="password" placeholder="비밀번호" onEnter={doLogin} />
            {err && <div style={{ color: PKD, fontSize: 12, marginBottom: 8 }}>{err}</div>}
            <button onClick={doLogin} disabled={busy} style={{ ...btnPrimary, width: "100%", marginTop: 6, opacity: busy ? 0.6 : 1 }}>
              {busy ? "확인 중..." : "로그인"}
            </button>
            <div style={{ fontSize: 11, color: MUTE, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
              센터장은 이름 '민다혜', 선생님은 본인 이름으로 로그인.
            </div>
          </>
        )}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed #e8d0d6", fontSize: 10.5, color: MUTE, textAlign: "center", lineHeight: 1.6 }}>
          {needSetup
            ? "이 비밀번호는 클라우드에 안전하게 저장되며, 어느 기기에서든 로그인할 수 있습니다."
            : "검단ABA언어행동연구소 · 도전행동 평가·중재 도구"}
        </div>
        <div style={{ marginTop: 12, fontSize: 10, color: "#bbb", textAlign: "center" }}>
          {COPYRIGHT}
        </div>
      </div>
    </div>
  );
}

// ── 헤더 ────────────────────────────────────────
function Header({ current, isAdmin, onLogout }) {
  return (
    <div style={{ background: "#fff", borderBottom: `1px solid ${PKL}`, position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: PKL, border: `1.5px solid ${PK}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          <img src={LOGO_B64} alt="로고" style={{ width: "82%", height: "82%", objectFit: "contain" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>BIP Maker</div>
          <div style={{ fontSize: 11, color: MUTE }}>도전행동 평가 · 중재 도구</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: isAdmin ? PKD : INK }}>
            {isAdmin ? "👑 " : "👩‍🏫 "}{current.name}
          </div>
          <button onClick={onLogout} style={{ fontSize: 11, color: MUTE, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 관리자 패널: 선생님 계정 추가/삭제 ──────────
function AdminPanel({ teachers, onAddTeacher, onRemoveTeacher }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const add = async () => {
    if (!name.trim()) return setMsg("이름을 입력해 주세요.");
    if (pw.length < 4) return setMsg("비밀번호는 4자 이상이어야 해요.");
    if (name.trim() === ADMIN_NAME) return setMsg("'민다혜'는 선생님 이름으로 쓸 수 없어요.");
    setBusy(true);
    await onAddTeacher(name.trim(), pw);
    setBusy(false);
    setName(""); setPw(""); setMsg(`✓ ${name.trim()} 선생님 계정을 추가했어요.`);
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, marginTop: 18, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", overflow: "hidden" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 700, color: PKD }}>
        <span>⚙️ 선생님 계정 관리 <span style={{ color: MUTE, fontWeight: 400, fontSize: 12 }}>({teachers.length}명)</span></span>
        <span style={{ color: MUTE }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${PKL}` }}>
          <div style={{ display: "grid", gap: 6, margin: "12px 0" }}>
            {teachers.length === 0 && <div style={{ fontSize: 12.5, color: MUTE }}>아직 추가된 선생님이 없어요.</div>}
            {teachers.map((t) => (
              <div key={t.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: PKL, borderRadius: 8, padding: "8px 12px" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>👩‍🏫 {t.name}</span>
                <button onClick={() => onRemoveTeacher(t.name)} style={{ fontSize: 11.5, color: PKD, background: "none", border: `1px solid ${PK}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>삭제</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px" }}>
              <div style={{ fontSize: 11, color: MUTE, marginBottom: 4, fontWeight: 600 }}>선생님 이름</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 이선생" style={inputStyle} />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <div style={{ fontSize: 11, color: MUTE, marginBottom: 4, fontWeight: 600 }}>초기 비밀번호</div>
              <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="4자 이상" style={inputStyle} />
            </div>
            <button onClick={add} disabled={busy} style={{ ...btnPrimary, flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
              {busy ? "..." : "추가"}
            </button>
          </div>
          {msg && <div style={{ fontSize: 12, color: msg.startsWith("✓") ? "#2e8b57" : PKD, marginTop: 8 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

// ── 케이스 목록 + 추가 ──────────────────────────
function CaseList({ tab, isAdmin, cases, onAdd, onSelect }) {
  const [adding, setAdding] = useState(false);
  const isPbs = tab === "pbs";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{isPbs ? "PBS 컨설팅 아동" : "센터 아동"} 목록</div>
        <button onClick={() => setAdding((v) => !v)} style={btnPrimary}>{adding ? "닫기" : "+ 새 케이스"}</button>
      </div>

      {adding && <AddForm isPbs={isPbs} onAdd={(c) => { onAdd(c); setAdding(false); }} />}

      {cases.length === 0 && !adding && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: MUTE, background: "#fff", borderRadius: 16 }}>
          아직 등록된 케이스가 없어요.<br /><span style={{ fontSize: 13 }}>+ 새 케이스로 첫 아동을 추가해 보세요.</span>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {cases.map((c) => <CaseCard key={c.id} c={c} isPbs={isPbs} isAdmin={isAdmin} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

function CaseCard({ c, isPbs, isAdmin, onSelect }) {
  const recCount = (c.records || []).length;
  return (
    <div onClick={() => onSelect(c.id)} style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          {c.name} <span style={{ fontSize: 12, color: MUTE, fontWeight: 400 }}>· {c.age}</span>
        </div>
        {isPbs && c.school && <div style={{ fontSize: 12, color: PKD, marginTop: 2 }}>{c.school}</div>}
        <div style={{ fontSize: 13, color: INK, marginTop: 6 }}>🎯 목표행동: <b>{c.target || "미설정"}</b></div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 4 }}>
          등록 {c.createdAt}{isAdmin && c.owner && ` · 담당 ${c.owner}`}
          {recCount > 0 && <span style={{ color: PKD }}> · 기록 {recCount}건</span>}
        </div>
      </div>
      <div style={{ color: PK, fontSize: 20 }}>›</div>
    </div>
  );
}

// ── 케이스 상세: ABC 기록 + 도전행동(횟수·강도) ──
const SEVERITY = [
  { v: "경도", label: "경도", desc: "파괴적이지만 위험은 거의 없음", color: "#7FB77E" },
  { v: "중등도", label: "중등도", desc: "재산 손해 또는 경미한 부상", color: "#E8A33D" },
  { v: "중도", label: "중도", desc: "보건·안전에 대한 중대한 위협", color: "#D85A5A" },
];

function CaseDetail({ c, isAdmin, onBack, onAddRecord, onRemoveRecord, onAddAssessment, onRemoveAssessment, onRemoveCase }) {
  const [showForm, setShowForm] = useState(false);
  const [section, setSection] = useState("record"); // record | assess | bip
  const [runningScale, setRunningScale] = useState(null); // 진행 중인 척도 id
  const [confirmDel, setConfirmDel] = useState(false);
  const records = c.records || [];
  const assessments = c.assessments || [];
  const isPbs = c.type === "pbs";

  // 요약 통계
  const totalCount = records.reduce((s, r) => s + (Number(r.count) || 1), 0);
  const sevCount = { 경도: 0, 중등도: 0, 중도: 0 };
  records.forEach((r) => { if (r.severity) sevCount[r.severity] = (sevCount[r.severity] || 0) + 1; });

  // 평가 진행 화면
  if (runningScale) {
    return (
      <AssessmentRunner
        scaleId={runningScale}
        childName={c.name}
        target={c.target}
        onCancel={() => setRunningScale(null)}
        onComplete={(asmt) => { onAddAssessment(asmt); setRunningScale(null); setSection("assess"); }}
      />
    );
  }

  return (
    <div>
      {/* 상단: 뒤로가기 + 삭제 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0 10px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: PKD, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          ‹ 목록으로
        </button>
        <button onClick={() => setConfirmDel(true)} style={{ background: "none", border: "none", color: MUTE, fontSize: 12.5, cursor: "pointer" }}>
          🗑 케이스 삭제
        </button>
      </div>

      {confirmDel && (
        <ConfirmModal
          title="케이스를 삭제할까요?"
          message={`'${c.name}' 케이스의 모든 기록·평가·중재안이 함께 삭제됩니다. 이 작업은 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          onConfirm={onRemoveCase}
          onCancel={() => setConfirmDel(false)}
        />
      )}

      <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{c.name}</div>
            <div style={{ fontSize: 13, color: MUTE, marginTop: 3 }}>
              {c.birth ? `${c.birth} · ` : ""}{c.age}{isPbs && c.school ? ` · ${c.school}` : ""}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: isPbs ? "#7B9BD8" : PK, padding: "4px 10px", borderRadius: 20 }}>
            {isPbs ? "PBS" : "센터"}
          </span>
        </div>
        <div style={{ marginTop: 12, padding: "10px 14px", background: PKL, borderRadius: 10, fontSize: 13.5 }}>
          🎯 목표행동: <b>{c.target || "미설정"}</b>
        </div>
        {isAdmin && c.owner && <div style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>담당 {c.owner} · 등록 {c.createdAt}</div>}
      </div>

      {/* 섹션 전환 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <SectionBtn active={section === "record"} onClick={() => setSection("record")}>
          📋 기록 <Badge>{records.length}</Badge>
        </SectionBtn>
        <SectionBtn active={section === "assess"} onClick={() => setSection("assess")}>
          🧩 평가 <Badge>{assessments.length}</Badge>
        </SectionBtn>
        <SectionBtn active={section === "bip"} onClick={() => setSection("bip")}>
          📝 중재안
        </SectionBtn>
      </div>

      {section === "record" && (
        <>
          {/* 요약 카드 */}
          {records.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              <StatBox label="총 발생" value={totalCount} unit="회" />
              <StatBox label="경도" value={sevCount.경도} unit="건" color="#7FB77E" />
              <StatBox label="중등도" value={sevCount.중등도} unit="건" color="#E8A33D" />
              <StatBox label="중도" value={sevCount.중도} unit="건" color="#D85A5A" />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>도전행동 기록 <span style={{ color: MUTE, fontWeight: 400, fontSize: 13 }}>({records.length})</span></div>
            <button onClick={() => setShowForm((v) => !v)} style={btnPrimary}>{showForm ? "닫기" : "+ 기록 추가"}</button>
          </div>

          {showForm && <RecordForm onSave={(rec) => { onAddRecord(rec); setShowForm(false); }} />}

          {records.length === 0 && !showForm && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: MUTE, background: "#fff", borderRadius: 16 }}>
              아직 기록이 없어요.<br /><span style={{ fontSize: 13 }}>+ 기록 추가로 도전행동을 관찰 기록해 보세요.</span>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {records.map((r) => <RecordCard key={r.id} r={r} onRemove={() => onRemoveRecord(r.id)} />)}
          </div>
        </>
      )}

      {section === "assess" && (
        <AssessmentSection
          assessments={assessments}
          onStart={(scaleId) => setRunningScale(scaleId)}
          onRemove={onRemoveAssessment}
        />
      )}

      {section === "bip" && (
        <BIPSection c={c} assessments={assessments} />
      )}
    </div>
  );
}

function SectionBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "11px 8px", borderRadius: 11, border: "none", cursor: "pointer",
      fontWeight: 700, fontSize: 13.5,
      background: active ? PKD : "#fff", color: active ? "#fff" : MUTE,
      boxShadow: active ? "0 3px 10px rgba(212,114,138,0.3)" : "0 1px 4px rgba(0,0,0,0.04)",
    }}>{children}</button>
  );
}

function StatBox({ label, value, unit, color = PKD }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "12px 8px", textAlign: "center", boxShadow: "0 2px 8px rgba(212,114,138,0.05)" }}>
      <div style={{ fontSize: 11, color: MUTE, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}<span style={{ fontSize: 11, fontWeight: 400, color: MUTE }}> {unit}</span></div>
    </div>
  );
}

// ── 기록 입력 폼 ────────────────────────────────
function RecordForm({ onSave }) {
  const [datetime, setDatetime] = useState(nowLocal());
  const [antecedent, setAntecedent] = useState("");
  const [behavior, setBehavior] = useState("");
  const [consequence, setConsequence] = useState("");
  const [count, setCount] = useState("1");
  const [severity, setSeverity] = useState("");
  const [err, setErr] = useState("");

  const save = () => {
    if (!behavior.trim()) return setErr("행동(B)은 꼭 입력해 주세요.");
    onSave({
      datetime, antecedent: antecedent.trim(), behavior: behavior.trim(),
      consequence: consequence.trim(), count: count || "1", severity,
    });
  };

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 4px 20px rgba(212,114,138,0.1)", border: `1.5px solid ${PKL}` }}>
      <div style={{ fontWeight: 700, marginBottom: 14, color: PKD }}>새 도전행동 기록</div>

      <Field label="날짜 / 시간" value={datetime} onChange={setDatetime} placeholder="예: 5월 23일 3:00" />

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 5, fontWeight: 600 }}>선행사건 (A) — 행동 직전에 무슨 일이?</div>
        <textarea value={antecedent} onChange={(e) => setAntecedent(e.target.value)} placeholder="예: 수학 학습지를 꺼냄" style={{ ...inputStyle, minHeight: 44, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: PKD, marginBottom: 5, fontWeight: 700 }}>행동 (B) — 관찰된 도전행동 *</div>
        <textarea value={behavior} onChange={(e) => setBehavior(e.target.value)} placeholder="예: 학습지를 찢음" style={{ ...inputStyle, minHeight: 44, resize: "vertical", fontFamily: "inherit", borderColor: PK }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 5, fontWeight: 600 }}>후속결과 (C) — 행동 직후에 무슨 일이?</div>
        <textarea value={consequence} onChange={(e) => setConsequence(e.target.value)} placeholder="예: 타임아웃 시킴" style={{ ...inputStyle, minHeight: 44, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 90px" }}>
          <div style={{ fontSize: 12, color: MUTE, marginBottom: 5, fontWeight: 600 }}>발생 횟수</div>
          <input type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: 12, color: MUTE, marginBottom: 5, fontWeight: 600 }}>강도 (심각도)</div>
          <div style={{ display: "flex", gap: 6 }}>
            {SEVERITY.map((s) => (
              <button key={s.v} onClick={() => setSeverity(severity === s.v ? "" : s.v)} title={s.desc}
                style={{ flex: 1, padding: "9px 4px", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                  border: `1.5px solid ${severity === s.v ? s.color : PKL}`,
                  background: severity === s.v ? s.color : "#fff",
                  color: severity === s.v ? "#fff" : MUTE }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && <div style={{ color: PKD, fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <button onClick={save} style={{ ...btnPrimary, width: "100%" }}>기록 저장</button>
    </div>
  );
}

// ── 기록 카드 ───────────────────────────────────
function RecordCard({ r, onRemove }) {
  const sev = SEVERITY.find((s) => s.v === r.severity);
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: MUTE }}>🕐 {r.datetime || "시간 미기록"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {sev && <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: sev.color, padding: "2px 8px", borderRadius: 12 }}>{sev.label}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, color: PKD, background: PKL, padding: "2px 8px", borderRadius: 12 }}>{r.count || 1}회</span>
          <button onClick={onRemove} style={{ fontSize: 11, color: MUTE, background: "none", border: "none", cursor: "pointer" }}>삭제</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <AbcRow tag="A" label="선행사건" text={r.antecedent} color="#8AA9D6" />
        <AbcRow tag="B" label="행동" text={r.behavior} color={PKD} bold />
        <AbcRow tag="C" label="후속결과" text={r.consequence} color="#7FB77E" />
      </div>
    </div>
  );
}

function AbcRow({ tag, label, text, color, bold }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: color, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{tag}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 11, color: MUTE }}>{label}</span>
        <div style={{ fontSize: 13.5, fontWeight: bold ? 700 : 400, color: text ? INK : MUTE }}>{text || "—"}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  간접평가 섹션 (목록 + 시작)
// ══════════════════════════════════════════════
function AssessmentSection({ assessments, onStart, onRemove }) {
  const [linkScale, setLinkScale] = useState(null); // 링크 만들 척도

  return (
    <div>
      {/* 척도 시작 버튼 */}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>새 평가 시작</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        {SCALE_LIST.map((s) => (
          <div key={s.id} style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: PKD }}>{s.name}</div>
                <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{s.fullName}</div>
                <div style={{ fontSize: 11, color: MUTE, marginTop: 4 }}>
                  {s.items.length}문항 · {Object.keys(s.functions).length}기능 판정
                </div>
              </div>
              <button onClick={() => onStart(s.id)} style={btnPrimary}>시작 ›</button>
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${PKL}`, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: MUTE, flex: 1 }}>👨‍👩‍👧 외부 교사·부모가 직접 작성하게 하려면</span>
              <button onClick={() => setLinkScale(linkScale === s.id ? null : s.id)} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>
                🔗 작성 링크
              </button>
            </div>
            {linkScale === s.id && <ExternalLinkBox scale={s} />}
          </div>
        ))}
      </div>

      {/* 완료된 평가 결과 */}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>완료된 평가 <span style={{ color: MUTE, fontWeight: 400, fontSize: 13 }}>({assessments.length})</span></div>
      {assessments.length === 0 && (
        <div style={{ textAlign: "center", padding: "36px 20px", color: MUTE, background: "#fff", borderRadius: 16 }}>
          아직 완료된 평가가 없어요.<br /><span style={{ fontSize: 13 }}>위에서 척도를 골라 평가를 시작해 보세요.</span>
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {assessments.map((a) => <AssessmentResultCard key={a.id} a={a} onRemove={() => onRemove(a.id)} />)}
      </div>
    </div>
  );
}

// ── 외부 작성 링크 생성 박스 ────────────────────
function ExternalLinkBox({ scale }) {
  const [copied, setCopied] = useState(false);
  // 배포 시: 실제 도메인 + 케이스/척도 토큰이 들어간 URL이 생성됨
  const demoUrl = `https://aba-geomdan.github.io/bip-maker/#/fill/${scale.id.toLowerCase()}/샘플토큰`;

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(demoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ marginTop: 10, padding: "12px 14px", background: "#FFF9FA", border: `1px dashed ${PK}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, color: INK, lineHeight: 1.6, marginBottom: 8 }}>
        이 링크를 외부 교사·부모에게 보내면, 앱 설치 없이 <b>{scale.name}</b> 설문을 직접 작성하고 제출할 수 있어요. 제출 결과는 이 케이스에 자동으로 들어옵니다.
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input readOnly value={demoUrl} style={{ ...inputStyle, fontSize: 11.5, color: MUTE }} onFocus={(e) => e.target.select()} />
        <button onClick={copy} style={{ ...btnPrimary, flexShrink: 0, padding: "8px 12px", fontSize: 12 }}>{copied ? "복사됨 ✓" : "복사"}</button>
      </div>
      <div style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
        🔜 실제 링크는 <b>GitHub 배포 + Supabase 연결</b> 후 생성됩니다. 지금은 예시 형태예요.
      </div>
    </div>
  );
}

// ── 완료된 평가 결과 카드 ────────────────────────
function AssessmentResultCard({ a, onRemove }) {
  const [open, setOpen] = useState(false);
  const scale = SCALES[a.scaleId];
  const maxSum = Math.max(...a.results.map((r) => r.sum), 1);

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 15, color: PKD }}>{scale.name}</span>
          <span style={{ fontSize: 11, color: MUTE, marginLeft: 8 }}>{a.date}{a.by ? ` · ${a.by}` : ""}</span>
        </div>
        <button onClick={onRemove} style={{ fontSize: 11, color: MUTE, background: "none", border: "none", cursor: "pointer" }}>삭제</button>
      </div>

      {/* 주요 기능 강조 */}
      <div style={{ marginTop: 10, padding: "10px 14px", background: PKL, borderRadius: 10 }}>
        <span style={{ fontSize: 12, color: MUTE }}>추정 주요 기능 </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: PKD }}>{a.top.name}</span>
        <span style={{ fontSize: 12, color: MUTE }}> (합계 {a.top.sum}점)</span>
      </div>

      <button onClick={() => setOpen((v) => !v)} style={{ marginTop: 10, fontSize: 12.5, color: PKD, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
        {open ? "▲ 기능별 점수 접기" : "▼ 기능별 점수 보기"}
      </button>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {a.sorted.map((r, i) => (
            <div key={r.f}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? PKD : INK }}>
                  {i === 0 ? "🥇 " : `${i + 1}. `}{r.name}
                </span>
                <span style={{ color: MUTE }}>합계 {r.sum} · 평균 {r.avg.toFixed(1)}</span>
              </div>
              <div style={{ height: 8, background: PKL, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(r.sum / maxSum) * 100}%`, height: "100%", background: i === 0 ? PKD : PK, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
//  평가 진행 (문항 응답 → 채점)
// ══════════════════════════════════════════════
function AssessmentRunner({ scaleId, childName, target, onCancel, onComplete }) {
  const scale = SCALES[scaleId];
  const opts = SCALE_OPTIONS[scale.scale];
  const [answers, setAnswers] = useState(() => scale.items.map(() => null));
  const [showResult, setShowResult] = useState(false);
  const [ocrState, setOcrState] = useState("idle"); // idle | loading | done | error
  const [ocrMsg, setOcrMsg] = useState("");

  const answered = answers.filter((a) => a != null && a !== "").length;
  const allDone = answered === scale.items.length;

  const setAnswer = (i, v) => setAnswers((prev) => { const n = [...prev]; n[i] = v; return n; });

  const finish = () => setShowResult(true);

  const result = showResult ? scoreAssessment(scaleId, answers) : null;

  // 종이 설문 사진 → AI가 읽어서 응답 자동 채움
  const onPhoto = async (file) => {
    if (!file) return;
    setOcrState("loading"); setOcrMsg("사진을 읽는 중이에요...");
    try {
      const filled = await readAssessmentPhoto(scaleId, file);
      setAnswers((prev) => {
        const n = [...prev];
        let cnt = 0;
        filled.forEach((v, i) => { if (v != null && i < n.length) { n[i] = v; cnt++; } });
        setOcrMsg(`✓ ${cnt}개 문항을 자동으로 채웠어요. 빈 문항이나 틀린 곳은 직접 확인·수정해 주세요.`);
        return n;
      });
      setOcrState("done");
    } catch (e) {
      setOcrMsg(e.message || "사진 인식에 실패했어요. 직접 입력해 주세요.");
      setOcrState("error");
    }
  };

  if (showResult && result) {
    const maxSum = Math.max(...result.results.map((r) => r.sum), 1);
    return (
      <div>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: PKD, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "16px 0 10px" }}>‹ 취소</button>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{scale.name} 평가 완료</div>
          <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>{childName} · {target}</div>
          <div style={{ marginTop: 16, padding: "14px 16px", background: PKL, borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: MUTE }}>추정 주요 기능</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: PKD, marginTop: 2 }}>{result.top.name}</div>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>합계 {result.top.sum}점 · 평균 {result.top.avg.toFixed(1)}</div>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>기능별 점수</div>
          <div style={{ display: "grid", gap: 10 }}>
            {result.sorted.map((r, i) => (
              <div key={r.f}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                  <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? PKD : INK }}>{i === 0 ? "🥇 " : `${i + 1}. `}{r.name}</span>
                  <span style={{ color: MUTE }}>합계 {r.sum} · 평균 {r.avg.toFixed(1)}</span>
                </div>
                <div style={{ height: 10, background: PKL, borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ width: `${(r.sum / maxSum) * 100}%`, height: "100%", background: i === 0 ? PKD : PK, borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ ...btnGhost, flex: 1 }}>취소</button>
          <button onClick={() => onComplete({
            scaleId, date: today(), answers,
            results: result.results, sorted: result.sorted, top: result.top,
          })} style={{ ...btnPrimary, flex: 2 }}>이 결과 저장하기</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onCancel} style={{ background: "none", border: "none", color: PKD, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "16px 0 10px" }}>‹ 취소</button>

      {/* 헤더 + 진행률 */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", marginBottom: 16, position: "sticky", top: 62, zIndex: 5 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: PKD }}>{scale.name}</div>
        <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{scale.fullName}</div>
        <div style={{ fontSize: 12, color: INK, marginTop: 8 }}>대상: <b>{childName}</b> · 목표행동: <b>{target}</b></div>
        <div style={{ marginTop: 10, height: 8, background: PKL, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${(answered / scale.items.length) * 100}%`, height: "100%", background: PK, borderRadius: 4, transition: "width .2s" }} />
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 5, textAlign: "right" }}>{answered} / {scale.items.length} 문항</div>
      </div>

      {/* 척도 안내 */}
      <div style={{ background: "#FFF9FA", borderRadius: 10, padding: "10px 14px", fontSize: 11.5, color: MUTE, marginBottom: 14, lineHeight: 1.6 }}>
        {scale.scale === "yn" && "각 문항에 예 / 아니오 / 해당없음으로 답해 주세요."}
        {scale.scale === "q0123" && "각 상황에서 목표행동이 얼마나 자주 나타나는지 선택하세요. (X 해당없음 · 0 전혀아님 ~ 3 자주)"}
        {scale.scale === "s0to6" && "각 문항에서 목표행동이 얼마나 자주 나타나는지 선택하세요. (0 전혀아님 ~ 6 언제나)"}
      </div>

      {/* 종이 설문 사진 자동입력 */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 14, marginBottom: 14, border: `1.5px dashed ${PK}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18 }}>📷</span>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: PKD }}>종이 설문 사진으로 자동입력</div>
            <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>외부에서 받은 종이 설문을 찍어 올리면 AI가 응답을 채워요.</div>
          </div>
          <label style={{ ...btnPrimary, cursor: ocrState === "loading" ? "wait" : "pointer", opacity: ocrState === "loading" ? 0.6 : 1, display: "inline-block" }}>
            {ocrState === "loading" ? "읽는 중..." : "사진 올리기"}
            <input type="file" accept="image/*" style={{ display: "none" }} disabled={ocrState === "loading"}
              onChange={(e) => onPhoto(e.target.files && e.target.files[0])} />
          </label>
        </div>
        {ocrMsg && (
          <div style={{ marginTop: 10, fontSize: 12, color: ocrState === "error" ? "#C04040" : ocrState === "done" ? "#2e8b57" : MUTE, lineHeight: 1.5 }}>
            {ocrMsg}
          </div>
        )}
      </div>

      {/* 문항 */}
      <div style={{ display: "grid", gap: 10 }}>
        {scale.items.map((item, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "0 1px 6px rgba(212,114,138,0.05)", border: answers[i] != null ? `1.5px solid ${PKL}` : `1.5px solid transparent` }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
              <span style={{ color: PK, fontWeight: 800 }}>{i + 1}.</span> {item.q}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {opts.map((o) => (
                <button key={o.v} onClick={() => setAnswer(i, o.v)} title={o.hint || ""}
                  style={{
                    flex: scale.scale === "yn" ? 1 : "0 0 auto", minWidth: scale.scale === "yn" ? 0 : 42,
                    padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
                    border: `1.5px solid ${answers[i] === o.v ? PKD : PKL}`,
                    background: answers[i] === o.v ? PKD : "#fff",
                    color: answers[i] === o.v ? "#fff" : MUTE,
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 하단 완료 버튼 */}
      <div style={{ marginTop: 18, position: "sticky", bottom: 0, paddingBottom: 8 }}>
        <button onClick={finish} disabled={!allDone}
          style={{ ...btnPrimary, width: "100%", padding: "14px", fontSize: 15, opacity: allDone ? 1 : 0.5, cursor: allDone ? "pointer" : "not-allowed" }}>
          {allDone ? "채점하고 결과 보기" : `${scale.items.length - answered}문항 더 응답해 주세요`}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  중재안(BIP) 섹션 — 템플릿 기반 생성
// ══════════════════════════════════════════════
function BIPSection({ c, assessments }) {
  const agg = aggregateFunction(assessments);
  const [chosenFunc, setChosenFunc] = useState(null);

  // 평가가 없으면 안내
  if (!agg || !agg.primary) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: MUTE, background: "#fff", borderRadius: 16 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🧩</div>
        중재안을 만들려면 먼저 <b style={{ color: PKD }}>간접평가</b>를 1개 이상 완료해 주세요.<br />
        <span style={{ fontSize: 13 }}>평가 결과의 주요 기능에 맞춰 중재안이 자동 생성됩니다.</span>
      </div>
    );
  }

  // 사용할 기능: 사용자가 고른 것 우선, 없으면 집계 1위
  const activeFunc = chosenFunc || agg.primary;
  const bip = generateBIP(activeFunc, c.name, c.target, c.type);

  return (
    <div>
      {/* 평가 요약 */}
      <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📊 평가 종합 ({assessments.length}개)</div>
        <div style={{ display: "grid", gap: 6 }}>
          {agg.detail.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: MUTE }}>{SCALES[d.scale].name}</span>
              <span style={{ fontWeight: 600 }}>{d.raw} → {UNIFIED_FUNC_NAME[d.func].split(" (")[0]}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: "8px 12px", background: PKL, borderRadius: 8, fontSize: 12.5 }}>
          종합 추정 주요기능: <b style={{ color: PKD }}>{UNIFIED_FUNC_NAME[agg.primary].split(" (")[0]}</b>
          {agg.detail.length > 1 && agg.ranked[1][1] > 0 && (
            <span style={{ color: MUTE }}> (평가 간 결과가 나뉘면 아래에서 기능을 직접 선택하세요)</span>
          )}
        </div>
      </div>

      {/* 기능 선택 (평가 결과가 갈릴 때 수동 조정) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 6, fontWeight: 600 }}>중재 대상 기능 선택</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
          {Object.keys(UNIFIED_FUNC_NAME).map((f) => (
            <button key={f} onClick={() => setChosenFunc(f)}
              style={{ padding: "10px 8px", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                border: `1.5px solid ${activeFunc === f ? PKD : PKL}`,
                background: activeFunc === f ? PKD : "#fff",
                color: activeFunc === f ? "#fff" : MUTE,
                position: "relative" }}>
              {UNIFIED_FUNC_NAME[f].split(" (")[0]}
              {agg.tally[f] > 0 && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>({agg.tally[f]})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 생성된 BIP */}
      <BIPDocument bip={bip} c={c} />
    </div>
  );
}

// ── BIP 문서 렌더 ───────────────────────────────
function BIPDocument({ bip, c, agg }) {
  const [aiState, setAiState] = useState("idle"); // idle | loading | done | error
  const [aiText, setAiText] = useState("");
  const [aiErr, setAiErr] = useState("");

  const copyText = () => {
    const txt = bipToText(bip, c, agg) + (aiText ? `\n\n[ AI 보강 ]\n${aiText}` : "");
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
  };

  const buildHtml = () => {
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tierName = { primary: "1차 기능", secondary: "2차 기능", tertiary: "별도 기능" };
    const fn = (f) => (UNIFIED_FUNC_NAME[f] || f).split(" (")[0];
    const tiers = (agg && agg.tiers ? agg.tiers.filter((t) => t.tier !== "minor") : []);
    const li = (arr) => arr.map((t) => `<li>${esc(t)}</li>`).join("");
    const title = bip.setting === "school" ? "개별 행동중재계획서 (PBIP)" : "행동중재계획 (BIP)";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(c.name)}_BIP</title>
<style>
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;color:#3A2C30;line-height:1.7;padding:32px;max-width:720px;margin:auto;}
h1{color:#D4728A;font-size:20px;border-bottom:2px solid #F5A0B1;padding-bottom:8px;}
h2{color:#D4728A;font-size:15px;margin-top:24px;background:#FFF0F3;padding:6px 10px;border-radius:6px;}
table{border-collapse:collapse;width:100%;margin:12px 0;}
td{border:1px solid #F5A0B1;padding:7px 10px;font-size:13px;}
td.k{background:#FFF9FA;color:#9A8A8F;width:80px;font-weight:600;}
.tier{display:inline-block;background:#F5A0B1;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-right:6px;}
.hyp{background:#FFF0F3;padding:12px;border-radius:8px;}
ul{margin:6px 0;padding-left:20px;} li{margin:4px 0;font-size:13.5px;}
.foot{margin-top:30px;border-top:1px solid #eee;padding-top:10px;color:#9A8A8F;font-size:11px;text-align:center;}
</style></head><body>
<h1>${title}</h1>
<table>
<tr><td class="k">대상</td><td>${esc(c.name)}${(c.age || c.school) ? " (" + [c.age, c.school].filter(Boolean).join(", ") + ")" : ""}</td></tr>
<tr><td class="k">환경</td><td>${bip.setting === "school" ? "학교 (통합/특수 학급)" : "ABA 센터"}</td></tr>
<tr><td class="k">작성</td><td>검단ABA언어행동연구소 · ${todayKr()}</td></tr>
</table>
<h2>1. 행동의 기능 및 가설</h2>
<p><b>표적행동:</b> ${esc(c.target)}</p>
<p><b>기능 가설:</b><br>${tiers.map((t) => `<span class="tier">${tierName[t.tier]}</span>${fn(t.func)} - ${esc(FUNC_HYPOTHESIS_SHORT[t.func])}`).join("<br>")}</p>
<p class="hyp"><b>주 기능: ${esc(bip.funcName)}</b><br>${esc(bip.hypothesis)}</p>
<p><b>행동의 의미:</b><br>${esc(FUNC_MEANING(bip.func, c.name, c.target, bip.setting))}</p>
<h2>2. 선행중재 (예방 전략)</h2><ul>${li(bip.antecedent)}</ul>
<h2>3. 대체행동중재 (교수 전략)</h2><ul>${li(bip.replacement)}</ul>
<h2>4. 후속결과중재 (반응 전략)</h2><ul>${li(bip.consequence)}</ul>
${aiText ? `<h2>AI 보강</h2><p>${esc(aiText).replace(/\n/g, "<br>")}</p>` : ""}
<div class="foot">© 검단ABA언어행동연구소 (민다혜). All rights reserved.</div>
</body></html>`;
  };

  const doPrint = () => {
    const w = window.open("", "_blank");
    if (!w) { alert("팝업이 차단되었어요. 팝업 허용 후 다시 시도해 주세요."); return; }
    w.document.write(buildHtml());
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const doSaveWord = () => {
    const blob = new Blob(["\ufeff", buildHtml()], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${c.name}_행동중재계획.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runAI = async () => {
    setAiState("loading"); setAiErr("");
    try {
      const text = await enhanceBIPWithAI(bip, c);
      setAiText(text);
      setAiState("done");
    } catch (e) {
      setAiErr(e.message || "AI 보강 중 문제가 발생했어요.");
      setAiState("error");
    }
  };

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 4 }}>
        <button onClick={copyText} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>📋 복사</button>
        <button onClick={doPrint} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>🖨 인쇄</button>
        <button onClick={doSaveWord} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}>📄 Word 저장</button>
      </div>
      {/* 대상 정보 표 */}
      <div style={{ border: `1px solid ${PKL}`, borderRadius: 10, overflow: "hidden", marginBottom: 12, marginTop: 6 }}>
        <InfoRow label="대상" value={`${c.name}${(c.age||c.school)? " ("+[c.age,c.school].filter(Boolean).join(", ")+")":""}`} />
        <InfoRow label="환경" value={bip.setting === "school" ? "학교 (통합/특수 학급)" : "ABA 센터"} />
        <InfoRow label="작성" value={`검단ABA언어행동연구소 · ${todayKr()}`} last />
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: bip.setting === "school" ? "#5B7BB5" : PKD, background: bip.setting === "school" ? "#EEF3FB" : PKL, padding: "5px 11px", borderRadius: 20, marginBottom: 16 }}>
        {bip.setting === "school" ? "🏫 학교(PBS) 맞춤 — 개별교수 제약 반영" : "🏛 센터(ABA) 맞춤"}
      </div>

      <BIPBlock num="1" title="행동의 기능 및 가설" accent>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 }}>표적행동 (도전적 행동)</div>
          <div style={{ padding: "10px 12px", background: "#FFF9FA", borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
            {c.target || "목표행동 미설정"}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 6 }}>기능 가설</div>
          <div style={{ display: "grid", gap: 8 }}>
            {agg && agg.tiers.filter((t) => t.tier === "primary" || t.tier === "secondary" || t.tier === "tertiary").map((t) => (
              <div key={t.func} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "#fff", background: TIER_COLOR[t.tier], padding: "3px 9px", borderRadius: 10, minWidth: 58, textAlign: "center", marginTop: 1 }}>
                  {TIER_LABEL[t.tier]}
                </span>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  <b style={{ color: PKD }}>{UNIFIED_FUNC_NAME[t.func].split(" (")[0]}</b>
                  {" — "}{FUNC_HYPOTHESIS_SHORT[t.func]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "12px 14px", background: PKL, borderRadius: 10, fontSize: 13.5, lineHeight: 1.7, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: PKD }}>주 기능: {bip.funcName}</span><br />
          {bip.hypothesis}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 }}>행동의 의미</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: INK }}>
            {FUNC_MEANING(bip.func, c.name, c.target, bip.setting)}
          </div>
        </div>
      </BIPBlock>

      <BIPBlock num="2" title="선행중재 (예방 전략)">
        <BulletList items={bip.antecedent} />
      </BIPBlock>

      <BIPBlock num="3" title="대체행동중재 (교수 전략)">
        <BulletList items={bip.replacement} />
      </BIPBlock>

      <BIPBlock num="4" title="후속결과중재 (반응 전략)">
        <BulletList items={bip.consequence} />
      </BIPBlock>

      <BIPBlock num="5" title="시각지원 자료 (인쇄용)">
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 12, lineHeight: 1.6 }}>
          이 기능에 맞춰 자동 생성된 시각카드예요. 화면 그대로 인쇄해 교실·가정에서 사용할 수 있어요.
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {getVisualCards(bip.func).map((card, i) => <VisualCard key={i} card={card} />)}
        </div>
      </BIPBlock>

      {/* AI 보강 */}
      <div style={{ marginTop: 18, borderTop: `1px dashed ${PKL}`, paddingTop: 16 }}>
        {aiState !== "done" && (
          <button onClick={runAI} disabled={aiState === "loading"} style={{ ...btnPrimary, width: "100%", opacity: aiState === "loading" ? 0.6 : 1 }}>
            {aiState === "loading" ? "✨ AI가 이 아동에 맞게 다듬는 중..." : "✨ AI로 이 아동에 맞게 더 구체화하기"}
          </button>
        )}
        <div style={{ fontSize: 11, color: MUTE, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
          위 중재안은 크레딧 없이 자동 생성돼요. AI 보강은 눌렀을 때만 사용됩니다.
        </div>

        {aiState === "error" && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#FFF0F0", border: "1px solid #F0B0B0", borderRadius: 10, fontSize: 12.5, color: "#C04040" }}>
            {aiErr}
          </div>
        )}

        {aiState === "done" && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 15 }}>✨</span>
              <span style={{ fontWeight: 700, fontSize: 14.5, color: PKD }}>AI 보강 (이 아동 맞춤)</span>
              <button onClick={runAI} style={{ marginLeft: "auto", fontSize: 11, color: MUTE, background: "none", border: "none", cursor: "pointer" }}>↻ 다시</button>
            </div>
            <div style={{ padding: "14px 16px", background: "#FFFBFC", border: `1px solid ${PKL}`, borderRadius: 12, fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
              {aiText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Claude API 호출 (AI 보강) ───────────────────
// ※ GitHub 배포 시: Supabase Edge Function 경유 fetch로 교체
//   (기존 Reels Maker / AAC 의 relay 패턴과 동일)
async function enhanceBIPWithAI(bip, c) {
  const prompt = `당신은 ABA(응용행동분석) 전문가입니다. 아래는 한 아동의 도전행동에 대한 행동중재계획(BIP) 초안입니다.
이 아동의 구체적 상황에 맞게 중재안을 더 실질적이고 구체적으로 다듬어 주세요.

[아동 정보]
- 이름: ${c.name}
- 연령/학년: ${c.age || "미기재"}
- 환경: ${c.type === "pbs" ? `학교(${c.school || "일반학교"})` : "ABA 센터"}
- 목표행동: ${c.target || "미기재"}

[추정 기능]
${bip.funcName}
${bip.hypothesis}

[현재 중재안 요약]
· 선행중재: ${bip.antecedent.join(" / ")}
· 대체행동: ${bip.replacement.join(" / ")}
· 후속중재: ${bip.consequence.join(" / ")}

위 내용을 바탕으로, 이 아동(${c.name}, ${c.type === "pbs" ? "학교" : "센터"} 상황)에게 바로 적용할 수 있는 구체적인 실행 팁 3~5가지를 제시해 주세요.
${c.type === "pbs"
  ? "- 이곳은 학교입니다. 교사 1명이 학급 전체를 지도하므로 1:1 개별교수나 즉각적 개입이 어렵습니다. 이 제약을 반드시 고려해, 선행중재·환경조정·또래활용·학급차원 지원·자기관리처럼 교사 혼자서도 학급을 운영하며 실행 가능한 방법 위주로 제안하세요."
  : "- 이곳은 ABA 센터로, 치료사가 아동을 1:1로 지도할 수 있는 환경입니다."}
- 교사/치료사가 오늘 당장 해볼 수 있는 수준으로 구체적으로.
- 각 항목은 한 문장~두 문장으로 간결하게.
- 번호 목록으로. 서론/결론 없이 목록만.
- 한국어로.`;

  // 배포 환경: 공용 claude-relay Edge Function 사용
  const SUPABASE_FN_URL = "https://vdubgrxwijydwfabwpnk.supabase.co/functions/v1/claude-relay";
  const res = await fetch(SUPABASE_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, max_tokens: 1500 }),
  });
  if (!res.ok) {
    let msg = "AI 서버 응답 오류";
    try { const e = await res.json(); if (e.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
    : (data.text || "");
  return text;
}

// ── 종이 설문 사진 인식 (Claude 비전) ───────────
// 이미지 + 문항목록 → 각 문항 응답값 배열(JSON)
async function readAssessmentPhoto(scaleId, file) {
  const scale = SCALES[scaleId];
  const opts = SCALE_OPTIONS[scale.scale];
  const validValues = opts.map((o) => o.v).join(", ");

  // 파일 → base64
  const base64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("사진을 불러오지 못했어요."));
    r.readAsDataURL(file);
  });
  const mediaType = file.type || "image/jpeg";

  const itemsText = scale.items.map((it, i) => `${i + 1}. ${it.q}`).join("\n");
  const scaleGuide =
    scale.scale === "yn" ? "각 문항 응답은 'yes'(예), 'no'(아니오), 'na'(해당없음) 중 하나."
    : scale.scale === "q0123" ? "각 문항 응답은 'x'(해당없음), '0','1','2','3' 중 하나."
    : "각 문항 응답은 '0','1','2','3','4','5','6' 중 하나.";

  const promptText = `이 이미지는 '${scale.name}' 도전행동 간접평가 설문지를 작성한 것입니다.
아래 ${scale.items.length}개 문항 각각에 대해, 이미지에서 체크/표시된 응답을 읽어주세요.

[문항 목록]
${itemsText}

[응답 규칙]
${scaleGuide}
- 유효한 응답값: ${validValues}
- 이미지에서 명확히 읽히지 않는 문항은 null.

반드시 아래 형식의 JSON 배열만 출력하세요(설명·마크다운 금지). 길이는 정확히 ${scale.items.length}:
[{"n":1,"v":"응답값 또는 null"}, ...]`;

  // 배포 환경: 공용 claude-relay Edge Function 사용 (이미지 지원 버전)
  let raw;
  const SUPABASE_FN_URL = "https://vdubgrxwijydwfabwpnk.supabase.co/functions/v1/claude-relay";
  const res = await fetch(SUPABASE_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: promptText, image: { media_type: mediaType, data: base64 }, max_tokens: 1500 }),
  });
  if (!res.ok) {
    let msg = "사진 인식 서버 오류";
    try { const e = await res.json(); if (e.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  {
    const data = await res.json();
    raw = Array.isArray(data.content)
      ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
      : (data.text || "");
  }

  // JSON 파싱 → answers 배열로 변환
  const cleaned = String(raw).replace(/```json|```/g, "").trim();
  let parsed;
  try {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    throw new Error("사진에서 응답을 해석하지 못했어요. 더 선명한 사진으로 다시 시도하거나 직접 입력해 주세요.");
  }

  const validSet = new Set(opts.map((o) => o.v));
  const answers = scale.items.map(() => null);
  parsed.forEach((row) => {
    const idx = (Number(row.n) || 0) - 1;
    const v = row.v;
    if (idx >= 0 && idx < answers.length && v != null && validSet.has(String(v))) {
      answers[idx] = String(v);
    }
  });
  return answers;
}

function getVisualCards(func) {
  const sets = {
    escape: [
      { type: "sequence", title: "활동 순서판", steps: ["앉기", "3개 하기", "쉬기"] },
      { type: "strip", title: "도움 요청 카드", items: ["도와주세요", "쉬고 싶어요"] },
      { type: "choice", title: "선택판", options: ["더 할래요", "그만할래요"] },
    ],
    attention: [
      { type: "strip", title: "관심 요청 카드", items: ["봐 주세요", "같이 해요"] },
      { type: "token", title: "칭찬 토큰판", count: 5 },
      { type: "choice", title: "차례 카드", options: ["내 차례", "기다리기"] },
    ],
    tangible: [
      { type: "sequence", title: "지금-나중에 카드", steps: ["지금은 안돼요", "이따가"] },
      { type: "strip", title: "요청 카드", items: ["주세요", "하고 싶어요"] },
      { type: "token", title: "기다리기 토큰판", count: 3 },
    ],
    sensory: [
      { type: "strip", title: "감각 도구 카드", items: ["만지작이", "쉬는 코너"] },
      { type: "sequence", title: "자기조절 순서", steps: ["멈추기", "숨쉬기", "도구 쓰기"] },
      { type: "choice", title: "지금 기분", options: ["괜찮아요", "힘들어요"] },
    ],
  };
  return sets[func] || sets.escape;
}

function CardFrame({ title, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #FFF0F3", borderRadius: 14, padding: 14, boxShadow: "0 1px 6px rgba(212,114,138,0.05)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#D4728A", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function VisualCard({ card }) {
  if (card.type === "sequence") {
    const n = card.steps.length, W = 300, bw = (W - 20 - (n - 1) * 24) / n;
    return (
      <CardFrame title={card.title}>
        <svg viewBox={`0 0 ${W} 96`} style={{ width: "100%", height: "auto" }}>
          {card.steps.map((s, i) => {
            const x = 10 + i * (bw + 24);
            return (
              <g key={i}>
                <rect x={x} y={18} width={bw} height={60} rx={10} fill="#FFF0F3" stroke="#F5A0B1" strokeWidth="2" />
                <text x={x + bw / 2} y={13} textAnchor="middle" fontSize="11" fill="#9A8A8F">{i + 1}</text>
                <text x={x + bw / 2} y={53} textAnchor="middle" fontSize="13" fontWeight="700" fill="#3A2C30">{s}</text>
                {i < n - 1 && <text x={x + bw + 12} y={53} textAnchor="middle" fontSize="18" fill="#D4728A">{"\u2192"}</text>}
              </g>
            );
          })}
        </svg>
      </CardFrame>
    );
  }
  if (card.type === "strip") {
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "grid", gap: 8 }}>
          {card.items.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#FFF0F3", border: "2px solid #F5A0B1", borderRadius: 12 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: "#F5A0B1", color: "#fff", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#3A2C30" }}>{t}</span>
            </div>
          ))}
        </div>
      </CardFrame>
    );
  }
  if (card.type === "choice") {
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "flex", gap: 10 }}>
          {card.options.map((t, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: "18px 8px", background: i === 0 ? "#EAF5EC" : "#FDECEC", border: `2px solid ${i === 0 ? "#7FB77E" : "#E89AAC"}`, borderRadius: 14, fontSize: 15, fontWeight: 800, color: "#3A2C30" }}>{t}</div>
          ))}
        </div>
      </CardFrame>
    );
  }
  if (card.type === "token") {
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", padding: "8px 0" }}>
          {Array.from({ length: card.count }).map((_, i) => (
            <div key={i} style={{ width: 40, height: 40, borderRadius: "50%", border: "2px dashed #F5A0B1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#E89AAC" }}>{"\u2605"}</div>
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 11.5, color: "#9A8A8F", marginTop: 4 }}>모으면 좋아하는 활동!</div>
      </CardFrame>
    );
  }
  return null;
}

function BIPBlock({ num, title, children, accent }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, background: accent ? PKD : PK, color: "#fff", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{num}</span>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</span>
      </div>
      <div style={{ paddingLeft: 32 }}>{children}</div>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 8, fontSize: 13.5, lineHeight: 1.6 }}>
          <span style={{ color: PK, flexShrink: 0, fontWeight: 800 }}>·</span>
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

// BIP → 복사용 텍스트
function bipToText(bip, c, agg) {
  const line = "-".repeat(30);
  const tierName = { primary: "1차 기능", secondary: "2차 기능", tertiary: "별도 기능" };
  const fn = (f) => (UNIFIED_FUNC_NAME[f] || f).split(" (")[0];
  const tierLines = (agg && agg.tiers ? agg.tiers.filter((t) => t.tier !== "minor").map((t) => "  [" + tierName[t.tier] + "] " + fn(t.func)) : []);
  return [
    bip.setting === "school" ? "[ 개별 행동중재계획서 (PBIP) ]" : "[ 행동중재계획 (BIP) ]",
    "대상: " + c.name,
    line,
    "1. 행동의 기능 및 가설",
    "표적행동: " + (c.target || "-"),
    ...tierLines,
    "주 기능: " + bip.funcName,
    bip.hypothesis,
    FUNC_MEANING(bip.func, c.name, c.target, bip.setting),
    "",
    "2. 선행중재",
    ...bip.antecedent.map((t) => "  - " + t),
    "",
    "3. 대체행동중재",
    ...bip.replacement.map((t) => "  - " + t),
    "",
    "4. 후속결과중재",
    ...bip.consequence.map((t) => "  - " + t),
    line,
    "© 검단ABA언어행동연구소 (민다혜)",
  ].join(String.fromCharCode(10));
}

// ── 케이스 추가 폼 ──────────────────────────────
function AddForm({ isPbs, onAdd }) {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [age, setAge] = useState("");
  const [target, setTarget] = useState("");
  const [school, setSchool] = useState("");

  // 생년월일 → 만 나이(년/개월) 자동 계산
  const autoAge = React.useMemo(() => {
    if (!birth) return "";
    const b = new Date(birth);
    if (isNaN(b.getTime())) return "";
    const now = new Date();
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (now.getDate() < b.getDate()) months -= 1;
    if (months < 0) return "";
    const y = Math.floor(months / 12), m = months % 12;
    return m > 0 ? `${y}세 ${m}개월` : `${y}세`;
  }, [birth]);

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), birth, age: (age.trim() || autoAge), target: target.trim(), ...(isPbs ? { school: school.trim() } : {}) });
  };

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 4px 20px rgba(212,114,138,0.1)", border: `1.5px solid ${PKL}` }}>
      <div style={{ fontWeight: 700, marginBottom: 14, color: PKD }}>새 케이스 추가</div>
      <Field label="아동 이름" value={name} onChange={setName} placeholder="예: 김○○" />
      <Field label="생년월일" value={birth} onChange={setBirth} type="date" />
      <Field label={autoAge ? `나이 / 학년  (생년월일 기준 ${autoAge})` : "나이 / 학년"} value={age} onChange={setAge} placeholder={isPbs ? "예: 고1" : (autoAge || "예: 5세 3개월")} />
      {isPbs && <Field label="학교" value={school} onChange={setSchool} placeholder="예: 인천영종고" />}
      <Field label="목표행동" value={target} onChange={setTarget} placeholder="예: 학습지 찢기" />
      <button onClick={submit} style={{ ...btnPrimary, width: "100%", marginTop: 6 }}>추가하기</button>
    </div>
  );
}

// ── 확인 모달 (브라우저 confirm 대체) ───────────
function ConfirmModal({ title, message, confirmLabel = "확인", onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: MUTE, lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ ...btnGhost, flex: 1 }}>취소</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#D85A5A", color: "#fff", fontWeight: 700, fontSize: 14 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── 푸터 (저작권) ───────────────────────────────
function Footer() {
  return (
    <div style={{ textAlign: "center", padding: "18px 16px 24px", fontSize: 11, color: MUTE, borderTop: `1px solid ${PKL}`, background: "#fff" }}>
      {COPYRIGHT}
    </div>
  );
}

// ── 공통 UI 조각 ────────────────────────────────
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${PKL}`, fontSize: 14, outline: "none", background: "#FFFBFB" };

// 문서 정보 행 (라벨-값)
function InfoRow({ label, value, last }) {
  return (
    <div style={{ display: "flex", borderBottom: last ? "none" : `1px solid ${PKL}`, fontSize: 12.5 }}>
      <div style={{ flexShrink: 0, width: 68, padding: "8px 10px", background: "#FFF9FA", color: MUTE, fontWeight: 600 }}>{label}</div>
      <div style={{ flex: 1, padding: "8px 12px", color: INK }}>{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", onEnter }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = PK)}
        onBlur={(e) => (e.target.style.borderColor = PKL)}
      />
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "12px 8px", borderRadius: 12, border: "none", cursor: "pointer",
      fontWeight: 700, fontSize: 14, transition: "all .15s",
      background: active ? PK : "#fff", color: active ? "#fff" : MUTE,
      boxShadow: active ? "0 4px 14px rgba(245,160,177,0.4)" : "0 1px 4px rgba(0,0,0,0.04)",
    }}>{children}</button>
  );
}

function Badge({ children }) {
  return <span style={{ display: "inline-block", minWidth: 18, padding: "1px 6px", borderRadius: 10, fontSize: 11, background: "rgba(255,255,255,0.3)", marginLeft: 4 }}>{children}</span>;
}

const btnPrimary = { padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: PK, color: "#fff", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 12px rgba(245,160,177,0.35)" };

const btnGhost = { padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${PK}`, cursor: "pointer", background: "#fff", color: PKD, fontWeight: 700, fontSize: 14 };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKr() {
  const d = new Date();
  return `${d.getFullYear()}. ${d.getMonth() + 1}.`;
}

function nowLocal() {
  const d = new Date();
  const mm = d.getMonth() + 1, dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0"), mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}월 ${dd}일 ${hh}:${mi}`;
}
