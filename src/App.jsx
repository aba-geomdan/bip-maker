import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================
// 도메인 가드 (무단 배포 방지)
// ============================================
(function domainGuard() {
  try {
    var host = window.location.hostname;
    var allowed = (
      host === "aba-geomdan.github.io" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "" ||
      /\.local$/.test(host)
    );
    if (!allowed) {
      document.documentElement.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#FFF0F3;color:#D4728A;font-family:sans-serif;text-align:center;line-height:1.8;">' +
        "<div><h1>접근할 수 없는 페이지</h1><p>검단ABA언어행동연구소의 지적재산입니다.</p></div>" +
        "</div>";
      throw new Error("Unauthorized host");
    }
  } catch (e) {
    if (e && e.message === "Unauthorized host") throw e;
  }
})();

const SUPABASE_URL = "https://vdubgrxwijydwfabwpnk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdWJncnh3aWp5ZHdmYWJ3cG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDk1ODgsImV4cCI6MjA5NzE4NTU4OH0.nqNO3vany3M6fzmG5BG6QVdvi8BW2UbhTDhxNnwvA88";
const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════
// A방식 인증 인프라 (SCERTS v2 패턴 이식)
// ═══════════════════════════════════════════════════════════════

// Auth 세션 관리 (Supabase Auth)
// =====================================================================
const AUTH_SESSION_KEY = 'sb-auth-session';

function getStoredSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 만료 확인 (5분 여유)
    if (s.expires_at && s.expires_at * 1000 < Date.now() + 5 * 60 * 1000) {
      return null; // 만료됨 (refresh 필요)
    }
    return s;
  } catch (e) { return null; }
}

function saveSession(session) {
  try {
    if (session) sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(AUTH_SESSION_KEY);
    // 과거 localStorage에 남아있던 자동로그인 흔적 제거 (보안)
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch (e) {}
}

async function refreshSession(refreshToken) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.access_token) {
      saveSession(data);
      return data;
    }
    return null;
  } catch (e) { return null; }
}

async function getValidAccessToken() {
  let session = getStoredSession();
  if (session?.access_token) return session.access_token;
  // 만료됐거나 없음: refresh 시도
  const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
  if (raw) {
    try {
      const old = JSON.parse(raw);
      if (old.refresh_token) {
        const refreshed = await refreshSession(old.refresh_token);
        if (refreshed?.access_token) return refreshed.access_token;
      }
    } catch (e) {}
  }
  return null;
}

// 인증 헤더 (Auth 세션의 access_token 사용)
async function authHeaders() {
  const token = await getValidAccessToken();
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

// =====================================================================
// Auth API 함수들
// =====================================================================
async function signInWithPassword(email, password) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) {
      return { error: data.error_description || data.msg || data.error || '로그인 실패' };
    }
    saveSession(data);
    return { session: data, user: data.user };
  } catch (e) {
    return { error: '네트워크 오류: ' + e.message };
  }
}

async function signOut() {
  try {
    const token = await getValidAccessToken();
    if (token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
      });
    }
  } catch (e) {}
  saveSession(null);
}

async function getCurrentUser() {
  try {
    const token = await getValidAccessToken();
    if (!token) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// 관리자용: 새 유저 만들기 (Edge Function 호출)
async function adminCreateUser(email, password, displayName) {
  try {
    const headers = await authHeaders();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'create',
        email,
        password,
        display_name: displayName || email.split('@')[0],
      }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error || '계정 생성 실패' };
    return { user: data.user };
  } catch (e) { return { error: '네트워크 오류: ' + e.message }; }
}

async function adminDeleteUser(userId) {
  try {
    const headers = await authHeaders();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'delete', user_id: userId }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return { error: data.error || '삭제 실패' };
    }
    return { ok: true };
  } catch (e) { return { error: '네트워크 오류: ' + e.message }; }
}

async function adminUpdateUserPassword(userId, newPassword) {
  try {
    const headers = await authHeaders();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'update_password', user_id: userId, password: newPassword }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error || '비번 변경 실패' };
    return { ok: true };
  } catch (e) { return { error: '네트워크 오류: ' + e.message }; }
}

// 관리자용: 전체 유저 목록 (RPC)
async function adminListUsers() {
  try {
    const headers = await authHeaders();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_users`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}

async function adminGetUserData(userId) {
  try {
    const headers = await authHeaders();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_get_user_data_bip`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ target_user_id: userId }),
    });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}

// =====================================================================
// 데이터 저장/조회 (bip_data 테이블 — RLS로 본인 데이터만 접근)
// =====================================================================
async function dataGet(key) {
  try {
    const headers = await authHeaders();
    const user = await getCurrentUser();
    if (!user?.id) return null;
    const url = `${SUPABASE_URL}/rest/v1/bip_data?user_id=eq.${user.id}&key=eq.${encodeURIComponent(key)}&select=key,value`;
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const rows = await r.json();
    if (rows && rows.length > 0) {
      return { key: rows[0].key, value: rows[0].value };
    }
    return null;
  } catch (e) { return null; }
}

async function dataSet(key, value) {
  try {
    const headers = await authHeaders();
    const user = await getCurrentUser();
    if (!user?.id) return null;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/bip_data`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        key,
        value,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) return null;
    return { key, value };
  } catch (e) { return null; }
}

async function dataDelete(key) {
  try {
    const headers = await authHeaders();
    const user = await getCurrentUser();
    if (!user?.id) return null;
    const url = `${SUPABASE_URL}/rest/v1/bip_data?user_id=eq.${user.id}&key=eq.${encodeURIComponent(key)}`;
    await fetch(url, { method: 'DELETE', headers });
    return { key, deleted: true };
  } catch (e) { return null; }
}

async function dataList(prefix) {
  try {
    const headers = await authHeaders();
    const user = await getCurrentUser();
    if (!user?.id) return { keys: [] };
    const filter = prefix ? `&key=like.${encodeURIComponent(prefix)}*` : '';
    const url = `${SUPABASE_URL}/rest/v1/bip_data?user_id=eq.${user.id}&select=key${filter}`;
    const r = await fetch(url, { headers });
    if (!r.ok) return { keys: [] };
    const rows = await r.json();
    return { keys: (rows || []).map((row) => row.key) };
  } catch (e) { return { keys: [] }; }
}

// ── 외부 제출용 저장소 (shared_store 유지: 부모는 로그인 없이 접근) ──
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

// ── 한글 조사 자동 선택 (받침 유무 판별) ──────────
// 마지막 글자에 받침이 있으면 josa[0], 없으면 josa[1].
// 사용: `${name}${K(name,"은","는")}` → "김주현은" / "민다혜는"
function hasJongseong(str) {
  if (!str) return false;
  const ch = String(str).trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false; // 한글 음절 아님
  return (code - 0xac00) % 28 !== 0; // 받침 인덱스 0이면 받침 없음
}
function K(word, withJong, withoutJong) {
  return hasJongseong(word) ? withJong : withoutJong;
}

// 문서 표시용 이름: 성(첫 글자)을 떼고, 받침 있으면 '이'를 붙여 부드럽게.
// 김주현 → 주현이 / 이민수 → 민수 / (2글자 이하는 성 안 뗌)
// 안전장치: 빈값·공백은 '아동', 비한글(영문 등)은 원본 그대로.
function isHangulSyllable(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
}
function displayName(fullName) {
  const raw = (fullName || "").trim();
  if (!raw) return "아동";
  // 전부 한글 음절인 이름만 성 떼기 대상 (영문·숫자 섞이면 원본 유지)
  const allHangul = [...raw].every(isHangulSyllable);
  if (!allHangul) return raw;
  let given = raw.length >= 3 ? raw.slice(1) : raw; // 3글자 이상만 성 제거
  return hasJongseong(given) ? given + "이" : given;
}

// ── 외부 작성 링크: 토큰 인코딩/디코딩 ──────────────
// 토큰 안에 케이스 식별 정보를 담아 서버 없이 링크만으로 작동시킨다.
// { cid: 케이스id, cn: 아동이름, tg: 목표행동, sc: 척도id }
function encodeFillToken(obj) {
  const json = JSON.stringify(obj);
  // 한글 포함 문자열을 안전하게 base64로 (btoa는 latin1만 지원하므로 escape 처리)
  const b64 = btoa(unescape(encodeURIComponent(json)));
  // URL 안전 형태로 변환
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeFillToken(token) {
  try {
    let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (e) { return null; }
}

// ── 외부 제출 저장/조회 (shared_store 재사용) ────────
// 제출 1건 = bipmaker::submit::{케이스id}::{제출id}
async function saveExternalSubmission(caseId, submission) {
  const sid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const key = `submit::${caseId}::${sid}`;
  return await bipStore.set(key, { ...submission, sid, submittedAt: new Date().toISOString() });
}
async function listExternalSubmissions(caseId) {
  try {
    const prefix = SKEY(`submit::${caseId}::`);
    const r = await _sb.from("shared_store").select("key,value").like("key", `${prefix}%`);
    if (r.error || !r.data) return [];
    return r.data.map((row) => {
      let v = row.value;
      for (let i = 0; i < 2 && typeof v === "string"; i++) {
        const s = v.trim();
        if (s && (s[0] === "{" || s[0] === "[")) { try { v = JSON.parse(s); } catch (e) { break; } } else break;
      }
      return v;
    }).filter(Boolean);
  } catch (e) { return []; }
}
async function deleteExternalSubmission(caseId, sid) {
  try {
    const key = SKEY(`submit::${caseId}::${sid}`);
    await _sb.from("shared_store").delete().eq("key", key);
  } catch (e) { /* ignore */ }
}


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
const LOGO_PDF_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALkAAABiCAYAAAAMVHKwAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAns0lEQVR4nO19e1hU1732u2Zmz4UZYBiQi6OGADaIDuDUnkKC0STGniRGT4yQ5mBEqG2pxDzmmJxTcvIESfNoT09z9AsxJWmiolJPwJrP3PxqTKKRRHuiiOKFGKSJOnJ1gLnP7JlZ3x8zCzfDDBeLNj3M+zw+Mnuvtfbae7/rt3+3tRZBGMOCAmSkMgSgt6IvYYQx7qCgIxL8etmRB0MYfxuEX8wokKpNUQ93/qKhre/W9CSMG0GY5EGwtbBIW1JbY9i7srTgvoS03b12m3G48i6R2VD1h97cVzp/73juF09GbKzeYr1VfQ1jZEj+1h34LqI4Lbm9BIA+avIWVSRPgAjNcOVVkVzsww/wvyGErKF1dY6N1VtuUU/DGA1Ef+sOfNdQXlqmJJWV3q2FRdoYRYTGYuZGNCotZo7+MHHK6q2FRVrk53vLS8uUt6KvYYwOYZIHYENCnB0AsqLjXhpr3azouJcIIXS62aIe946FccMIkzwQ69dTAIiVRC8aa9W0yKQVe1eWFpTU1hi2FhZpx79zYdwIwiQXYGthkZYQQpmqciNtzFJHPgcAxUse6gi7Fb8bCJNcgOK05HbgxlQVhtQ4TeaBorVVpKDAg4qKMMm/Awi/hACkalPUHz+68usbleQMf7zSPK2ktsbw6bwKyT2HK93j1b8wxo6wJPfj7ZI3YwHgP+9fuDAUwYP5y0P50B+doru0Jn6V4p7DlW5aURF+zn9DhB++HwX/GNUHALdFKB8Idl4VyRNu9rTOkY4JseafY44CAHNJjmN3wxgDwiSHL++EFBR4ls/Mig/mVem124yef36MTJp390zhMav+LjJp3t0zfQGjoUiQJegurH22CQBCeVy2FhZpaUWFiNbViWlFhSg8GMYf4YgngG2FRZNRW2NY+oPc+aFUFUfLFcjTpww6xtk63MCUYZ8hI3rVH3pzS2rfNAAArasTAwApKPCU1NYYSgZXMVBKCSEknNk4TggbnvCRjhQUeE6sXrctLTJpxc26znnTt0/l/K5qUMx/a2GRNis67qUoaQwBgCPdX/97SW2NgVZUiEhlpfdm9WUiYcKTnAKEALS8tEz5y+jbTcOVZUZmjCJCI/x7LNfrtduM19z97wNApFQ0O0GWoAss8+eOK68trNm8Jkz08cGEJ/nWwiJtcW3N1XdWlubfl5C2O1Q56Q+mecX6OZLuw5+dZceYjm5/fe+4E/HjztbHl26vrrMU7hSrap/wjHf7EwkTXicvTktuJwA9EcKrwuD68pJIoZ8DofEJAOI/vE0Bbtz75ffy1CmXyIDacW9+QmFCS/Ly0jLlxuot1q2FRdpHp+gujaZOxF1phM7KJI6WK6CH/+emqRK9dpsx+ZUXJt2s9icSJrQk35AQZ98IQM0p7hptHcPB09dw8DSAsevjN4Kwp+Wvx8T2k/szDvVRk0c9yyFGEaFh/25Wt1SRPGHGKdavn9Bf2/HAhCU5ragQ/bUZhzcLFjNHT/X3PE8pJc919ij+1v35e8eEVleAsWUcCt1/QGgX4EhoNbfv+NZm3Q/4UnOFbfTabcZPrl3MLqmtMXwdqVKG54v+9Ziwn0Km637z1IvdI0nyXrvN2Gi6Wrb3y6OHdp091SU8x4I5ow0iMR94YBtzk9LnNPd8K1u6vboOuG4Uj/W+whiKCSnJ/ZMjDHtXlhaMRPBOZ2fzix8fWMjIvSZ+lWL2/bwG8OWjlNTWGAAU711Zun84PzuDhTiOUErJtuUrJwe0YWBl/EGgMMHHCRNSJ2eTI0JlHApR9Yfe3F1nT3Utn5kVf2L1um2/+Vmi5fHbp156/Paply6sfbZp78rSAgBYur267s8dV14bqb0+3v4585b4ye1L0qqrE7PkrHCUc3wxIUmOyvU0VMahEH/uuPJaVdeb9uUzs+JfuH/hgezJcUWcRMSz86lxmswlabf9NyP6juOf/upGulNSW2NgyVo3Uj+M4THhSP52yZuxBIQOl3HIcMXd+2tKKVn6g9z5qXGaTJfDSnm3dyC86XJYKeAzHpfPzIrfdfZUV6u5fcfNvocwxoYJR/KRJkcw9Nptxk+amnhCCB2urMthpVNVMt3SH+TOBwDmNQnju4MJRfKRJkcE4pRH7AV8rsLhyknlygnrpfp7wIQiOerqRAAwGlUlRhGhefr7OhkAmF3ek6HKcRIR73JYaR9v/xwYnTEbxq3FxCJ5fr4XGD0RWU7Lqf6e55n+HQgiUUjPGe07mNE4ktQP49ZjwpCcAoQQQvPy5kpHQ0RVJE9mqSOfy8ubKy2prTFctjibQ6kl39qs+ylA9q4sLbiRCGgYNxcTJhjEdoNoaDjiargt5SE1Zx4+87DT59P+8NlnuKiGI67RtL+Vt39+3vTtU1ftfHewMn28/fNNJ5qdwHUf+UiglBLU1w8RRu8Ye2OXlv68K1idMAYjbDCNAntXlhY8MCUuaDRTKleSpqs9Nd9/7eXiW92vMEaHCUVyCpA0bUr0f96/cOFkBTeqCQkckc7J0ChWSOVKEkovl8qV5GKP8bTZ5T3JU9dxANhHvdtZ7kl3aSn3ntkeD4xRghOCbYVFk5NmpmfZL3yrCizD8lzCGB4ThuRswvKa+FWK3/ws0TIWt18ocgsR2J7LYaXnjPYdp/p7ni+prTF0l5Zyk6qr+VD1h/TXv4LA+Tdef2v6HWkltN88pA8Hz5xf9I/lv9z/zutvTAqrLqExYQxPBpZcBfiIOJp/o2k3WJ3syXFFj98+9dLelaUFk6qr+dEuHFReWqZEfr53a2GRNlkTsyIYwQEgOU7zKCGEPvLznwW1AcLwYcKR/FbC5bBSTiLiWX7LaNctL39gIQghNHfenS9KpFKx2+UaNFuf/U7WxKwoLy1TEkJoeHeL0AiT/CaD5bo8MCVud3lpmbJ41/ary2dmxYcqTwES2dhoLy8tUyZrYoLmqDPiS6RS8aMz01cCvoERRnCESX4L4HJYqVSuJMtE8lcJIXTnsn/qCVXWvG9fBKms9K7QZ74iJHNgOXYsSRX5CwCIbGy037w7+PtGmOS3EJFS0exUbYqaTaAOxN7q1+OjliyxMl18NG3Gx6oz9m/Y+CCprPSyNRbDGIwwyW8CpHIlEXpbXLwaADBVJdP9+/y5QXVoSilhBuSPFtzzp+GkOMOAbh6neRQAkD/ut/K/AmGSjyMYsZuu9tR8abi6ZvdfLk/b/ZfL0z7ubH286WpPjbCscIc4tkg/IYSef+P1t+Jj1RkjEVyIZE3MCt+UvgJP2AAdignnJ99aWKR9/Papl4YL7twIWHv7r/Q8HipIU15appxutqjZ9DvMnEnMMpk8askSKwCcf+P1t9ISE8YUOWWD4dS3l9fMWbNmi2nfPiVrLwwfJkzuys0EI/juv1yexiKax6uqypQyqR4ArE5X4x/PtrAIqDVgPXLr1sIibe68O18cK8GF8BugWyIXL7bd+J3870SY5OOE/Vd6Hi+prTGUl5YpV+gzXwkgbPHMpITNK/SZO6xOV+P3pk3bDgAXLl1aqZRJ9cmamBXBVJPRqCzsfHysOuN4VVUZIWQLi5aO5/39PSNM8hCQypXElZ7qQdPpYe0WJsX3fnn0EACs0Ge+wsLwwiCORCoV+4lf7HY5NwNA1m1TBwgcjNDCQBA7x8oJy7O/2ZcjbIAORtjwDAHPPz9GxPo5ksCcFHFJiQjZmYOWjDhntO/YdfZUFwvgMIJLpFIx++d2uTxCwgoJGkhwVo7OyiRi/RyJsL5YP0dCZ2WSYBI+bIAGR5jkIUDOnA5plIZSIX6QnRmSWEJij+Y4AHgaj7vJmdOUREcGJbWwDTZQMnPm/BMQjoAKESZ5AJjkdv/Pcdp9+LOzgR6Y7sOfnRWdPn9T+yBUU9wul4fvvuZmx8mZ05ScOU2FXwYhBiKgYQN0AGGSB4G4pERkTE07bz11dshOypqLrTNCuR6/bDod1HUXjIzDwe1yebhJsRKxfo5EeEz4TyKVitl5oZ4+EAElhIYjoD6EDc8AuBxWKjlzGpPm3T1z0ry7If7D20PSbZm0Z8czNIoVunT9sxurt/Q8OjN9bdZtU6uEKsSNeE5ov5liKoiQ6IPOD9OOPwL64dju/H8vwsGgEJD8wxxCZ2WGfD5C8kvlSrKv9dsfsyDQ8aqqsqzbplaxsm6Xy/ONsXeH1elqBHwqxUhRTSb9Q5GcqSyBBisbXLvf+SC5pLYmvCcowiQf9uUbU9POB26EJbr8F/AffTrIu8LaerGnN4pNedtaWKRlRuAlTlovnLmTqk1Rf/bSCw2jCd8HuhBDHROeC0dAByNM8lGAk4h4IlFIhys/mrA+mzBRUltjYCH80eaoBPrchysnkUrFXdf6zv3jf7wy//T5E9cmuiQP6+SjAO/2cnAPPyBYzvh9CerdJ1ave4CnruNX7Xx3H2//XM0p7rotQvlAhkaxYvdfLk+jADnhU11GHcYfbbKWMAL6mxX5/0AI+XCiR0DDJB9HuBxWKuV8czsBFAl1dnYe8K3RcnyUbY5VXWHnJVKpOGyA+hB2Id4EBE6AFv79daSqb7TtBHpnAiOmI7kmByKgBRM7AjrhSH7yI84IANRtH3FVrPHGOaN9x2j3ARJ6Slo7OrfZKYnc/c4HyXZKIls7OrcJzwfWDUdAB2PCkJwtE/ch94kM8C3Ueav7MNq1ywNdgTN+9vOfRC1ZYi2prTFELVlinfGzn/9k9zsfJA9HdIaZSQmbU7Up6okcAZ0wJAd8C/ZcNLT1nTPab+luEGyFraXbq+vo8ePcSOWZerL//U8KS2prDGw/ofLSMuXWwiKtad8+ZUltjeHQhYtLhOWDtSGRSsWvlv30ThCCiRoBnVCG57Z9HyQCMHxrs+7PRlzRrbgmcy02dHc9BABmg0EKIORKWkIX4NLt1XX+YI4H13eHs5bU1rAVtj40bNt+Lj5WnTFcW8lxmkcJ8OFE9SNOKEleUltjoBUVoqXbq+uarvbU3OwdIoS+89EuLMRg4p1/Li8tU5rffTci2HmzTCanlBIT7/wzMHx+zEQ3QCcUyQEAlZWUVlSINh0++G8Xe4ynbxbRA4NDlsKd4rHu7jaSkTpSkEdogObOu/NFYGIaoBNKXQF8BiitrMQuoGvX2VPZJ1av28ZWrR2va7gcVtp0tadm0+GD/7br7Kmu7tJSTlX9xCAVRSmT6umsTCI5c3rIbCASHUmSXa4VWwuLXohcvPgqi9ayMpRSAsDGJmmQ6Egi6TcH1beF7ZWXlj01EUP8E47kgJ/ofuJ8/7WXi7cWFj2fERX1TxyRzrnR7VDYvkI8dR0XLtu8tbBIO6m6ekCCH2zvUAKwWp2uxu7Dn/0waGPX+q73lRBKKypEqKwcIPm25Ssn+9UftdFs+wrmERwn1/rA1Brg+pbrN3KfYfwdwi8Vx7/dujrxmvhVipvRdhhjw4SU5EIMSEoAmDmT4OzZG5Nw69dTrF9PtrV+k/R1pKqPFBRYAYRcn7C8tEy54XevDiuCRyNtxzJIw9I7jDDCCCOMMMIII4wwwggjjDDCCCOMMMIIYwi+sxOZB/y/hEAY0g6G8tIy5YZ75zlCnd+274PE4tqaqyO1E3jtvwe/cn5+vri+vn7Czt8cDQaRPC9v7pCJBElJiZ6RHmJ+fr64vb0jaO5Ewyj2pQ9EYK7GeKG8tEw52pk5wNjC32viVylOfu+rgedk7EiYdK51z5gSsm4l8vPzR5VbHuzds/d9pOEzviC/QNTe3iEe7XsejisMo22L8fVGODYsUrUp6lRtinqs9XTp+rjR1OsuLeUA33723zz1YvfymVnxlFISbFtAlja6tbBIe2L1um2h/u1dWVrA6tNhvl5Mgp9/4/W3zr/x+lvA9a1OhkNG2rKgKbSBYf3s9Bxd4DPwlRkctQxGwOz0HF2wYxlpy7S6dH1cYAptqjZFjSJflqkuXR8XTIDdGIaPsLLr6NL1cbp0fdz4XPOvw0CHden6OI5EzJdK5FNcbscVAJBK5FOISHRNHGl/u6HhiCtVm6JOjE3/UiwSx/dYZBlMUuln5C0T1hPWtTh79je3NPbcnf3wKQDJwnqBWBO/SvFK5+8dz/3iyYhfRt9uUkXy5OOvO7csrNm8JtiyCkzSXlj7bFNqnCZzuBu92GM83dDd9RDLKSeVlYMWCGLt79+w8cEFs2a8DwB2SiKjliyx7q1+PT70tt6UAIRmpC3TRitN98rEEfOdHtshu9PU1NRyrDkvb660oeGISz8jb1msavLbdt66uaHpg3XsuPD5A0BzS+PA9oesTI5uwdpIueZls8O47ljzwc3sqyGyqL+UcYpZTt5ukXEKldXZ/74oypbf32ONipFrL7q9rkM2V//zkyKnNVkcfZuONh94JiNtmfZc6x5Djm7BWjmnGjJwhPBQXkOVpscCJaV+Rt6yKEXcA7zbdbdITM7wbufhY80HN7PzqdoUtXbSzG8p8X5y5OQHj7BrAkBu1sIn5GIFdXjsQwYLO844M1zfWD8AoPF8w57hyknYg1RymuWRcs3LwQqZ+72xAP0/QCoAQMYpVJrE9m60+qSJShbzloxTqILVdbpsjwHYAyCZ1ctLHPyCGWbfz2sIIYYTq9e9CgAWM0e/F635cXlp2S+Rn29bE79KUdX1Zsh8ELafvfBYpFQ0e6pKpvMPgg9StSnzAZiGVM7P9wJAZlLSb9ghQ2fHKwB+8ogm5lqw6/nUH2LN1S38rUouehpQAwA4sXSlSqqGfobksYaGI3soKPk+5gIACEEK4FNnABhStSnqyfEztsklysU2p6Xt7uyHbS6Pfdux5oObZ1+4Q9yAI5CIZVMBgIhE1wDg5Pe+8vgHzq9EIvEDHq/nbkppL6X064aGI67s9JwkGadQeZyeDBGR3OG7LpkOAJrEzm60AlKxopgTS2eFepYA4OU9lmv+fgYOOP99AkCKXKJcfGfmj+6xufqfj5BGvwT4OEIpnQ0A95nUxnPwc0Wq3g4AKrEs6DVVYhkIJe8DWBLM3mBfTankiiZWNfltJ2+36NL1h4YbFBJGNgdv+ZhAtEl4khPL7pdxilkEoikAofC9n0EQEckdMk6hcvJ2C+9x/h4inGLn5GIF9VL3V/6f39iclojPvwyuP5WXlimLf/fq1a8jVcq0yKSBPSxjFBGae/q5XxNC1tC6OldVwZuh7gUA8P3XXh60YE+qNkW9P//RQ6lyZebAFoOVlX1bC4u0bBKDb+F6Yti/YeODwqlkaYkJxfs3bPwjKSj4UFie9Xdj9RZrdnqOTiVXPw0AZodxncvtuCKTROSo5OqnVbKYt3Tp+kOkhfTokTeon/eZ1EZxuj4uRq69KJMoVDanpU0sEsfLOIVKxilezs1aeA3t2AMAHg9PwQHU641l9XN0C9YqOGWPw2M7BIpeq7MfEOFUjm7BWgdv+XjYhySAodc7beYG0oH6gBP5QH3Bex7AR6yGhj2G7PQcHSO42WFcZ+WNu1SyuAdUUvV2pSx6EQCw/wHA5Xb0AwATTGZz12UFF7UJIUAIma6URS8iEGcAQOLhaCkCktw0iZ3dDQ1HXHnZD/0LAFDi/SRdl9obHacMKjgBQRZiU8uxZgDPsN/+T85P2W+/ugEA8U7ebjH2+ka4kMRHmw8M1A+GCJkqJVe38LcU3itW3rhLOPqmmy1qQoj1QNHaX6um8MRi5mins7M5QZag+2HilNVMmo9kPC6fmRW/aW5uLwDEJSR4SGVln9Hp+H0qUMVJRLyaU9wFoO72K990sjrFu7ZfLamtGZDiwvVN/Mc+ZGUYjpw5zQOAgosqAgCLo2+T4JO9587MH01XyqIXRXkTj96V+eCQflZ1vWnPSVjwcxnnI7jJ1ZFrM/e54zVpz6vk6qclIm5pVdebO4Pdo6WHv2NSZNLLQHCJ6HI7HmODRsFFbQz1rAAgStGXf7HiuprJILsQodDPyLPfdS39g5OJX3WjFZBzqvsAwOrsf/9Y88HNfgfBzlzdwiyVXP20SCRp7TZfypZzqvuCaQUXDW19Fw1tITmSm7XwCQCLiIi8C/i+WBAoiWyw6WfkLVNwyrUAYHX019bXf+AB4AnlaRogubCAzidhPmZ6ntNtO8ak1XV4EYBkXbo+br5Rb2Wf02A3wtrxS5ueNfGrFKqlMlHx7169evIjTvHDxCmrAR6dzs7mM33mDQkJCbsBwL9ldzGtq3NsrN4S6jlh19lTXbvOnhp0jCPSOYBvubc+3v45AMyfP9+Lw4eDSvGz7Z1rlTKpPi0xoTg+Vp2xd2VpASGkbrjl1ii8VwCfXSFUqSJkqqGfP9YviWweAHiJ+0U24GUK/SaVHE8TKro3VZuiTrpda4OFG6S/NrUca9bPkDwWq5r8NuAbYBDhlETELXV7+b1e6v6KfRUADFIjZ1+4Q4w8SKnV2wZgVigVFQBUUjU+5vumoSMBAAxCmysYPB6eKmRR2dQ7hBsDCGYAz52VyR05c5r39CMLADyUbwos47e/DPoZectUspi3AN9gU3BRG+fOfqjwmlnxZH19fVBbb4Dk9fX1Hl26Pk4li3uAI7JnmEHTee3roouGtr68vLkKSw9/h1Kq2RshU6Uw3U6I5pbGnmY0Al2+m2n/iyEiPi7tYYuzZ79UIo8GfC+EwnvFbO66DPgkGr23TkwIoSdWr3sN8OniZ/rMG5Zur667sPbZ5xJkCbq0yKQVWwuLnkd+/tXhpPnelaUFkxXcJPabI9I5GRrFCsC3uE+g4Vm8K7m9pBaDpPglTlrfd/iL/5v8yEMrJFKp+Ifzcl7A9uo6prcDPtcqADD1TCpWFGen53xc1fJmc3Z6jk4iks4HAIurb6XdaWoKJd0AwO40DbxUp73RaotIb4uQqVJSJs+5BifghN0SWEcmjVCw53m0+cAzuVkLn5BLlIvtvLXNA9d+9oWw86ZyNhjY80YXkKpNKY6PS3tYLlZQAPB4vc/KOMUsO2/dzIkkJwHA4bGTc60HBojTb7p6MFY1GUpZ9KIc3YK1mbxxl55EzOfEsp8CfnVDGh0gDH0IdLEKse9gp1qTiG4RkSwBAKfLZve7GgfKEEJojm7BWqlYUcnuzebqfz5KPmmXTKJYrI3BYk32Q5vbu8//6qKhrU/YvgTwfQbUEebXJCLpfGZAOnn7GZOje/lFQ1tfqjZF3dBwpA9AM/v0MsNp4KFzCtVdmQ9+LRaJfRMBLEhOmZykopReHniBvN0SqNKUl5YpmRrCdPFeu8347EcHDlBKyTvFvxiQ5lMkMb/06+YhpfmStNv+O/AYddtdF3uMLZsOH/w3AHius0cBwErr6sSEFHiOV1WVMSn+jbF3B/Ok5M67cweT5v7dGwZ0c/bVszh79ouopC1CppoVhUkNd2U+2MWkt9XZ//7R0wd2AoB+Rt4dQTsMwOWeYmRuw8YvTgwcd/L2M/4/k4fck18/J4RM16Xr4+xOU5NKqoYIogU2c9+vEOkrx4jJkJc3V+oxKx5jv5mXQ0QlEYBPitrs/Q42iHKzFj7BPEUXDW198Zq0TSq5+ulIueZl4aC1OvvfN7u6f0IJfUBMuGymTjCwwRUCBrQCd2c/bHPydku/6erB+voGDwAP4DNYo+STdsk4xSx2LSZ8U7Up8xJip9coZdGLFJxybWJs+uLIyPilfvUbgECSM4I73NZ3rY7+WqFbRjgyvNS9z+rsny6WdDvXxK9SnIz76iurqf99pSx6EXu5Tt4neRxu67u823nYyhv3c0T2DICYQAf+hnvnOfxS/FV2jUbT1bLWTb82m999N+LTD93v6X9sM8YoIjQ/TJyyek38qn9Ffr7D7xceMrPmYo/xdOCx1DhNZmqcIvOF+xceALBww+9e7Z5utmiRf7YduL7Pjtvl8hw9/MUL9PhxzmwwSPfv6/7X5AddK4bTzZtbGnt06fpcIkoql0siHiWEpDh5+xne4/yoy9j6UkbaMu19JrXxc7QMebMej1sEiU8vrq/36fPZ6TlTI2SqFCdvt3zW9F4WAOTqFv5WxikGJGRG2jKtyY56qdheqZRFL5KIpBeZcOKp87fCa0RHTV4AAMyY85oi6pXSqCxCyNQhHQKgkqq3q6Tqgd+U0ssiKuEBTPertM/kZi08JRFxS2XiiNk2l+mUl3o+7Ta2bffzZGd2ek6TglOuZV9v/33pFLKo7GDXZOA9zo8AID4u7eHoqMl2ntoONbc09sg51X0yTjHL5rS0eahry7Hmg5sz0pZp79HrFnWauE+/OL1nSW7Wwic4Ins1QqZKsfOmOwAMuG8lAHCudY9Bl65PhT8wruQ0y3N0C9YG6wiF94qTdxwTqiYAlmSkLdNqEju7AaDfbI0KdOncna2FjFOoOnoMA+eYFN9aWKRlUrzT2dm8dHt1HbZXA4AVAO4xlZbdp0jbDQArl0W/RggpphUVQV2J39v8n4MeZKo2RV235JFNGRrFitQ4TebT8xb8ByGkmB4/3kXIHG+gFC+prTH4ScwDsJ7PeT2kNGfX8N/POgDrUAQRaq4bLHl5WltV6x6XPnawdwUAKKF7ACySihWVuVkLr9mdpibmgqPE+wkrBfxoSN1zrXsM2ek5eZEk9kWvl85yuK2f8G7n4W5j23uAX01ymZrM5q7LsarJ8FL3PnZNt5fvAQAC+qnDYydCvzX7Wy5WUN7rni0RcWovcR8CgLMnaSIAw9FTB3YCGGIUMxvC0jN47aSMtGXaSZGipmDvKxRUUjXMDuM6AJutvHEXEYmuWVw+/3l5aZny0NGv7xWLon+lUdn+mJG27L+OntqzU5eu3++xpMjOtTYYgOuCdECSM+LlZi18QiVVhzRGAJ+kZr5JZrCKJW1OYk16m3c7Dze3HNkMXNfD/BdLDmxHIMVfEh4/sXrdtlDXTotMWlFeWvYk1q+3ob5eBP8njWH5zKz4nWeaurF+PcH69ZQQ0vf9114uvrD22dmpcmVmhkaxYk38qtVkzhx7Xt5cKZPiDCzSGQyhpDngUwNEFvWX7pOub77An5YwKTKgu/vhdvMXWXnA/rbNJHkhQqZKkUExIEGdvN1idlx7wWfEEjsweK0UZg/5P8mPAL7AiFIeXZgyec7LNqelTUzENk4+CQpZ1G+7zZeyPXC1A4CQoKnaFHV8XNrDDo+dUK83lkA0xe61XiEi0bUe2+X/19zSuEt4XRbQSdWmqBNip9cQiDNMro7c6Dilya++oqFhT192eg6A6y7E+0xq43HFpU0SCZfq8bhFYrHE6/G4RcB1l6PV2f8+ALBzYrHEa7Kr64EBbg4Mqo3VW6y5WQvBvkasX75yjUPe2wDJAyNwTNUIrCAVKyqFv/15CB6ORMyXS5SLCRWl5OXNfQ0ATsJnaOTn54uvXOh/knc54XGnyIDGoFIc8KkWAIJEL3lYzBwFrntaTPv2yeGX9kJsW75y8sORiq73lq+MpxUV7aSy0utfMiIT8AWdUAvD5scKfir0i6cuuL8ksC0AgH9PT6E0Z54W5k0xdiRM0saIZnmcnghduj4uKSmxNy9vrrS9vQP5+flob+9419Dhnea0t1qB67ktqdqUH0zSpKzkJLJ5YsIZnbyt186bappajjW70qZo0YWgHgPAJyE1iZ3dnn7FBua1sjktbQqpknO5HckyTqGSQbFdRCVtJMo8E6AkL+9uLikp0XO5pXfNSJ4VlS5uU5ex9aWk27U2ITeSbtfaFE4/OV3SpKSkxF5jB8XM2aRDkzhXauxIMBp6vdPEEoMTGNDHh7gOM9KWaZUyLHK4re9+cfpPj4TqS6o2Rf0gf6/z46g+zcBBrykL8AXXhGkV95nUxo+j+jTCqHrI2foSIvnjkeYPdgUevyvzwbJg5ZmhAoRMmBn0eQsmxVvN7TtgDtUjIFYSvShGEaFh0jzYQjkBLkRDCXzSnXlYgOtrhAt18W+MvTvQ8VHIaydrYgbp5kJPSyCaWxp7mlsagcFfGeF6hgPSx+873gxgc2A7TGKLxT4XIot4CttItaeotZNm3g8A1yxXHxPaUrp0fVyUNPFohEyVYuiImAQQQ0MDXP4YSCUA2HnrZg/lm/qtUZ8AQLTSdC/g183l6qf7FfpNDQ17+gJ90CyVABhI4jKcax16nwzB8nGuXOi/l0WJ8/PzxYmHo6Ud8/pdAJAWGy/fWL3FytIhWmCCdtCCb756colysTYGi9nRlhhfOWl6TnZTy7HmNfGrFCFJ7qbuR/Uz8hyAj8BOl80OAGKReEiiFOBz+/g/t8ksPyGwjMNjJ+JI+9tHGo7wpKDAI5TivXabMTBaGYi9K0sLmG5+j5379UZgTbAywt9sGxNOIuIBSNka4YG6+Iyf/fwnw137/BuvI1A3p3V14qeePDConFgkjmfRyGDt9No6Twktf8D3FWVqTXt7hzgwg9Hj4SmVXPdSCXFxQZtJe8q3d5dUIp+iS9fH2cx97ohItUQMaVKw9xURqR547zZn/9GA3I+d2ek5Oo7Izsg4xSw/6QcJKP9XSwX4AkT36JdkMT0e8L1nuVhBO03cp+w+hAOEDZjcrOtqWH19vWdN/CphOSsAeKn7K4fb+q7XQ4dNQRCCwnOOqWdVXW/aQ5JcLlEulquUAyNEaHEz74kQLPLJPpHB2lSKpJetZoD4H1pWdNxLqkhfdLPRdLUM8GUhxiUkDNJjra1pBADKPzw84Gn5XrTmx1sLi34tNAClciVZkqYc4kJkpy/2GE/v8TqeBIJ4VCgloRbXjHQ6He8Ye8vT/Hv8DGxTkg9UFfgCP5rEzm6nRW1hYflg7VBKLyulGh7AdGHQKODLNyAJ2XE7b6oRiznC/OnseH5+vri+pt7D65wfyTjFrEi55mWpWFEZJU3sAq4HoqzO/vfP3fWn9vIFZcrWa12O+vr6njszJx2SQbEoVjX57buzH7Z4vJ4uwDdImYS2OS1tFlfPfmAwScWSNqfNmdgWIVOlMJVHGHllf8ep7JZUbcptgX7rQBAqChkwE9odN4oBkrMHd/TUgZ05ugWxck6lc3v5IZ2TiDi1y2Nvjo5TmoT1mlqONedmRa2UiSPmB6vH6tqdpiaWL/6tzbo/zZy0otPZ2fzph+73ykvLlHHVW2zBcskthTvFVV1v2pmnxSUyG76OVPUxXzqA51LUivS2PvtQXx0Ao9Px+5zfVW2hlJKN1Vtg4p1/jgcymEeleNd2EmqdQFpRIVpaWdl1/o3Xt6UlJlz/2gjyPRoajrgy0pZlaFTWf/F4+KA56GIxR7zE3RTs3HDwv+h1gccZ8fzBIJ9bTxIxGwAH+Owqt5ff23Wt9T3UwLsR1wNoX5z+05Ic3YK1nEQ2z+ulsxRSJQcALrfjG4fb2ub28nuZNyPwus0tjT0ZacvmE5H1XwB/bk2Qe3V7nJeDEZz12+40NXFEdsblsYd0NABDo8gjYazlbzq2FhZpg+WKBwPLBS8vLVOyvOzh8sODtiFYcYotpTyaVahYmbEsvzyeGL988ImHoC93NA80mHE51lkfN7LwZLA6wfLDA+uwRTLHcq2xYrjQNcNoZlrdCJhhJ2w7wIU7BMwWCOxPeWmZ8siZ0/xwM26EcZHhMNKsHUopeSrhp/LvlOQdb5SXlinHKo1vpE6odm5FnTD+tvj/lt0nHnCodOcAAAAASUVORK5CYII=";


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
  // 원본 FAST 검사지 앞부분(문항 앞 사전 정보). 16문항 응답 전에 작성.
  preInfo: [
    { key: "behaviors", label: "문제 행동", type: "checkbox",
      options: ["공격성(Aggression)", "자해행동(Self-Injury)", "상동행동(Stereotypy)", "파괴행동(Property destruction)", "기타(Other)"],
      hint: "상동행동: 반복적으로 나오는 행동(예: 손톱 물기, 제자리 돌기, 이상한 소리내기 등) · 파괴행동: 책 찢기, 장난감·가구 등을 부수는 행동" },
    { key: "behaviorDetail", label: "문제 행동 구체적 모습", type: "textarea", placeholder: "행동별 구체적인 모습을 적어주세요 (예: 공격성 - 꼬집기·깨물기 / 상동행동 - 박수치기·소리지르기)" },
    { key: "behaviorOther", label: "기타 문제행동 (직접 입력)", type: "text", placeholder: "위에서 '기타'를 선택한 경우 구체적으로 적어주세요" },
    { key: "frequency", label: "빈도(Frequency)", type: "radio",
      options: ["매시간 발생", "매일 발생", "매주 발생", "더 적게 발생"] },
    { key: "severity", label: "심각도(Severity)", type: "checkbox",
      options: ["경도 : 파괴적이지만 재산이나 건강에 대한 위험은 거의 없음", "중등도 : 재산 상 손해 또는 경미한 부상", "중도 : 보건이나 안전에 대한 중대한 위협"] },
    { key: "highDaysTimes", label: "발생 가능성이 가장 높은 상황 — 일/시간(Days/Times)", type: "text" },
    { key: "highSettings", label: "발생 가능성이 가장 높은 상황 — 상황/활동(Settings/Activities)", type: "text" },
    { key: "highPersons", label: "발생 가능성이 가장 높은 상황 — 특정인의 존재(Persons present)", type: "text" },
    { key: "lowDaysTimes", label: "발생 가능성이 가장 낮은 상황 — 일/시간(Days/Times)", type: "text" },
    { key: "lowSettings", label: "발생 가능성이 가장 낮은 상황 — 상황/활동(Settings/Activities)", type: "text" },
    { key: "lowPersons", label: "발생 가능성이 가장 낮은 상황 — 특정인의 존재(Persons present)", type: "text" },
    { key: "antecedent", label: "문제행동이 일어나기 직전에 보통 무슨 일이 일어나는가?", type: "textarea" },
    { key: "consequence", label: "문제행동이 발생한 직후에 보통 일어나는 일은?", type: "textarea" },
    { key: "treatment", label: "현재 치료를 받고 있습니까?", type: "textarea" },
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
    tangible: "물건·활동 요구",
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
  // 표준 MAS 순서 (검단ABA 실제 사용 양식과 동일): 기능이 감각→회피→관심→획득 순으로 순환
  // 감각 1,5,9,13 / 회피 2,6,10,14 / 관심 3,7,11,15 / 획득 4,8,12,16
  items: [
    { q: "대상자는 오랫동안(2,3시간) 혼자 있을 때 문제행동을 계속적으로 반복하는가?", f: "sensory" },       // 1 감각
    { q: "어렵고 하기 싫은 일을 시키면 문제행동을 시작하는가?", f: "escape" },                          // 2 회피
    { q: "당신이 다른 사람과 이야기하고 있으면 문제행동을 하는가?", f: "attention" },                    // 3 관심
    { q: "대상자에게 음식이나 물건을 갖지 못하게 하거나, 활동을 못하게 하면 문제행동을 하는가?", f: "tangible" }, // 4 획득
    { q: "주변에 아무도 없으면 아주 오랫동안 같은 방식으로 문제행동을 반복하는가?(예, 한 시간 내내 몸을 앞뒤로 흔드는 것 등)", f: "sensory" }, // 5 감각
    { q: "대상자에게 어떤 요구를 하면 문제행동을 하는가?", f: "escape" },                              // 6 회피
    { q: "대상자에게 주던 관심을 중단하면 문제행동을 하는가?", f: "attention" },                        // 7 관심
    { q: "위 행동은 가질 수(먹을 수, 할 수) 없다고 알고있는 물건, 음식, 활동 등을 얻고자(먹고자, 하고자) 할 때 일어납니까?(제한된 것을 얻고, 하고 싶을 때)", f: "tangible" }, // 8 획득
    { q: "대상자가 문제행동을 즐기는 것처럼 보이는가?(문제행동으로 생긴 빛, 소리, 맛, 냄새, 촉감 등을 즐기는가?)", f: "sensory" }, // 9 감각
    { q: "당신이 원하는 것을 시킬 때 대상자가 당신을 화나게 하거나 괴롭히기 위하여 문제행동을 하는 것 같은가?", f: "escape" }, // 10 회피
    { q: "관심을 보이지 않을 때 대상자는 당신을 화나게 하거나 괴롭히기 위하여 문제행동을 하는 것 같은가?(예, 전화를 하거나 다른 사람과 이야기 할 때)", f: "attention" }, // 11 관심
    { q: "요구하는 장난감이나 음식이나 활동을 허용하면 대상자는 잠시 후 바로 문제행동을 멈추는가?", f: "tangible" }, // 12 획득
    { q: "문제행동을 할 때 대상자는 자기 주변에서 일어나고 있는 일에 개의치 않고 문제행동을 계속하는가?", f: "sensory" }, // 13 감각
    { q: "대상자에게 하던 어떤 요구를 철회하면 바로(1-5분 내에) 문제행동이 중단되는가?", f: "escape" }, // 14 회피
    { q: "상대방(타인)과 함께 시간을 보내기 위해 위의 행동을 하는 것 같습니까?", f: "attention" }, // 15 관심
    { q: "대상자는 자기가 원하는 것을 하지 못하게 할 때 문제행동을 하는 것 같은가?", f: "tangible" }, // 16 획득
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
// 공통기능: attention(관심) / escape(회피) / sensory(감각·자동) / tangible(획득) / physical(신체·통증)
const FUNC_UNIFY = {
  // FAST
  social_pos: "attention", social_neg: "escape", auto_pos: "sensory", auto_neg: "physical",
  // QABF
  attention: "attention", escape: "escape", nonsocial: "sensory", physical: "physical", tangible: "tangible",
  // MAS
  sensory: "sensory",
  // (attention/escape/tangible 은 위와 키 공유)
};
const UNIFIED_FUNC_NAME = {
  attention: "관심 끌기 (사회적 정적강화)",
  escape: "회피·도피 (사회적 부적강화)",
  sensory: "감각 자극 (자동강화)",
  tangible: "선호물 획득 (물질적 강화)",
  physical: "신체적 불편·통증 (자동 부적강화)",
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
  physical: "신체적 불편·통증에서 벗어나려는 동기(의료적 원인 우선 확인)",
};

// 행동의 의미 서술 (임상적 재해석)
function FUNC_MEANING(func, name, target, setting) {
  const who = displayName(name);
  const place = setting === "school" ? "학급" : "치료 상황";
  const base = {
    attention: `${who}의 도전적 행동은 예측할 수 없는 돌발적 행동이 아니라, "나에게 관심을 주세요"라는 의사를 적절한 방식으로 전달하지 못한 채 강도 높은 행동으로 표현하는 학습된 기능적 의사소통의 대체 수단입니다.`,
    escape: `${who}의 도전적 행동은 예측할 수 없는 돌발적 행동이 아니라, "이 활동을 하고 싶지 않다"는 거절·회피 의사를 적절한 방식으로 전달하지 못한 채 강도 높은 행동으로 표현하는 학습된 기능적 의사소통의 대체 수단입니다.`,
    sensory: `${who}의 도전적 행동은 문제 삼아야 할 '나쁜 버릇'이 아니라, 충족되지 못한 감각 욕구가 겉으로 드러난 신호입니다. 안전하고 수용 가능한 대체 감각활동을 제공하면 조절 가능한 행동입니다.`,
    tangible: `${who}의 도전적 행동은 예측할 수 없는 돌발적 행동이 아니라, "그것을 갖고 싶다·하고 싶다"는 요구를 적절한 방식으로 전달하지 못한 채 강도 높은 행동으로 표현하는 학습된 기능적 의사소통의 대체 수단입니다.`,
  };
  if (func === "physical") {
    return `${who}의 도전적 행동은 감각을 추구하는 자기자극이 아니라, 신체적 불편·통증 등 내부의 고통 상태에서 벗어나려는 신호일 수 있습니다. 이 경우 행동중재에 앞서 의학적 원인(질환·통증·수면·투약 등)에 대한 평가와 의료적 의뢰가 우선되어야 하며, 의학적 원인이 배제·조절된 뒤에 아래의 행동지원을 병행합니다.`;
  }
  return `${base[func] || base.escape} 적절한 대체행동 교수와 강화 수반성 재설정을 통해 ${place}에서 충분히 변화 가능한 표적행동입니다.`;
}


// 부모님용 쉬운 버전 — 전문용어 없이, "~해주세요" 톤, 예시 풍부
const PARENT_BIP = {
  attention: {
    why: "아이가 이런 행동을 하는 것은 말썽을 부리려는 것이 아니라, \"나를 봐주세요\", \"관심을 가져주세요\"라는 마음의 표현입니다. 아직 그 마음을 적절한 말이나 행동으로 나타내는 법을 배우지 못해, 문제행동으로 관심을 얻으려는 것입니다.",
    prevent: [
      "아이가 얌전히 잘 있을 때 먼저 다가가 관심을 주세요. 문제행동이 나오기 전에 미리, 자주(5~10분마다) \"잘하고 있구나\" 하고 눈을 맞추며 칭찬해주세요.",
      "관심을 언제 받을 수 있는지 미리 알려주세요. 예를 들어 \"이거 다 하면 안아줄게\"처럼 예고해주면 아이가 안심하고 기다릴 수 있습니다.",
      "잘하는 순간을 놓치지 말고 바로 말해주세요. \"혼자서 신발을 신었구나\", \"동생에게 양보했구나\"처럼 구체적으로 칭찬해주세요.",
      "야단치기보다 칭찬을 훨씬 많이(4배 이상) 해주세요. 아이는 혼나는 것도 관심으로 느끼기 때문에, 야단이 오히려 문제행동을 늘릴 수 있습니다.",
    ],
    teach: [
      "관심이 필요할 때 적절히 표현하는 법을 가르쳐주세요. 예: 손 들기, \"봐 주세요\"라고 말하기, 어깨를 가볍게 두드리기.",
      "아이가 바르게 표현하면 하던 일을 멈추고 바로 반응해주세요. 그래야 아이가 \"이렇게 하면 봐주시는구나\"를 배웁니다.",
      "조금씩 기다리는 것도 가르쳐주세요. \"잠깐만, 이것만 하고 봐줄게\"처럼 짧게 시작해 기다리는 시간을 점차 늘려주세요.",
    ],
    respond: [
      "문제행동을 할 때는 반응을 최대한 줄여주세요(위험하지 않은 경우). 눈맞춤, 잔소리, 표정 반응을 줄이면 그 행동으로는 관심을 얻지 못한다는 것을 배웁니다.",
      "대신 문제행동이 멈추고 바르게 행동하는 순간, 바로 충분한 관심과 칭찬을 주세요.",
      "처음에는 문제행동이 잠시 더 심해질 수 있습니다(그동안 통하던 방법이기 때문입니다). 흔들리지 말고 일관되게 반응해주시면 점차 줄어듭니다.",
    ],
  },
  escape: {
    why: "아이가 이런 행동을 하는 것은 \"이거 너무 어려워요\", \"하기 싫어요\", \"그만하고 싶어요\"라는 마음의 표현입니다. 힘든 상황에서 벗어나고 싶지만 그것을 적절히 말하는 법을 배우지 못해, 문제행동으로 표현하는 것입니다.",
    prevent: [
      "과제를 아이 수준에 맞게 조절해주세요. 너무 어려우면 잘게 나누고, 쉬운 것부터 성공하게 해 자신감을 먼저 갖게 해주세요.",
      "중간중간 쉬는 시간을 미리 넣어주세요. \"세 개 하고 한 번 쉬자\"처럼 정해두면 좋습니다.",
      "선택할 기회를 주세요. \"수학 먼저 할까, 책 먼저 볼까?\"처럼 아이가 고르게 하면 거부가 줄어듭니다.",
      "무엇을 얼마나 하는지 그림이나 순서표로 보여주세요. 끝이 보이면 아이가 훨씬 잘 견딥니다(\"먼저 이거, 그다음 이거\").",
    ],
    teach: [
      "\"쉬고 싶어요\", \"도와주세요\"를 말이나 카드로 표현하도록 가르쳐주세요. 벗어나는 대신 도움을 청하는 법을 알려주는 것입니다.",
      "아이가 이렇게 표현하면 바로 짧게 쉬게 하거나 도와주세요. 그래야 \"이렇게 말하면 되는구나\"를 배웁니다.",
      "조금씩 참는 것도 가르쳐주세요. \"이거 하나만 더 하고 쉬자\"처럼 아주 조금씩 늘려가세요.",
    ],
    respond: [
      "문제행동을 한다고 해서 과제를 아예 없애지는 마세요. 그러면 \"이렇게 하면 안 해도 되는구나\"를 배우게 됩니다. 대신 도와주거나 양을 줄여서라도 마무리하게 해주세요.",
      "바르게 요청하거나 과제에 참여하면 바로 쉬게 해주고 칭찬해주세요.",
      "정해진 만큼 하면 좋아하는 활동을 하게 해주세요. \"이거 끝나면 좋아하는 블록 놀이를 하자\"처럼 안내해주세요.",
    ],
  },
  sensory: {
    why: "아이가 이런 행동을 하는 것은 몸이 원하는 감각(만지는 느낌, 움직이는 느낌, 보는 느낌 등)을 채우려는 것입니다. 말썽이 아니라 아이의 몸이 그 자극을 필요로 하는 것입니다. 그래서 주변에 아무도 없을 때에도 이 행동이 나타나곤 합니다.",
    prevent: [
      "아이가 좋아하는 감각을 안전하게 채울 수 있는 물건을 가까이 두세요. 예: 촉감을 좋아하면 촉감 장난감이나 말랑이, 움직임을 좋아하면 트램폴린이나 짐볼을 손 닿는 곳에 두세요.",
      "정해진 시간에 미리 감각 놀이를 하게 해주세요. 예를 들어 20~30분마다 몇 분씩 좋아하는 감각 활동을 하면, 문제행동으로 자극을 찾을 필요가 줄어듭니다.",
      "하루 일과 속에 몸을 움직이고 감각을 채우는 시간을 규칙적으로 넣어주세요(전문가나 치료사와 상의해 시간표를 만들면 좋습니다).",
      "심심하거나 지루한 시간이 길어지지 않게 해주세요. 그럴 때 감각 추구 행동이 더 나오기 쉽습니다.",
    ],
    teach: [
      "문제행동 대신 비슷한 감각을 얻는 다른 행동을 가르쳐주세요. 예: 물건을 입에 넣는 대신 씹기 장난감 물기, 손을 흔드는 대신 말랑이 만지기.",
      "\"만지고 싶어요\", \"움직이고 싶어요\"를 말이나 카드로 표현하도록 알려주세요. 그러면 정해진 자리에서 감각 도구를 쓰게 해주세요.",
      "스스로 진정하는 순서를 알려주세요. 예: '멈추기 → 숨쉬기 → 도구 쓰기' 그림 카드로 연습합니다.",
    ],
    respond: [
      "아이가 바르게 감각 도구를 요청하거나 사용하면 바로 칭찬해주세요.",
      "문제행동을 할 때는 차분하게 반응하고, 가능하면 그 행동이 주는 자극을 줄여주세요(안전한 범위에서). 예: 소리 때문이라면 조용한 환경으로, 촉감 때문이라면 다른 재질로 바꿔주세요.",
      "좋아하는 감각 활동도 가끔 종류를 바꿔주세요. 늘 똑같으면 아이가 금방 싫증을 냅니다.",
    ],
  },
  tangible: {
    why: "아이가 이런 행동을 하는 것은 \"그거 갖고 싶어요\", \"그거 하고 싶어요\"라는 마음의 표현입니다. 원하는 것을 얻고 싶지만 적절히 요청하는 법을 배우지 못해, 문제행동으로 표현하는 것입니다.",
    prevent: [
      "언제 가질 수 있는지 미리 알려주세요. 예: 타이머나 \"이따가\" 카드로 \"조금 있다가 줄게\"를 눈에 보이게 해주세요.",
      "좋아하는 것을 끝내야 할 때 미리 예고해주세요. \"5분 뒤에 정리할 거야, 이따 또 할 수 있어\"처럼 안내해주세요.",
      "원하는 것을 적절히 요청할 기회를 자주 만들어주세요.",
      "\"안 돼\"만 반복하기보다, 언제 어떻게 얻을 수 있는지 함께 알려주세요. 예: \"지금은 안 되지만, 밥 먹고 나서 하자\".",
    ],
    teach: [
      "원하는 것을 적절히 표현하는 법을 가르쳐주세요. 예: 그림카드 건네기, \"주세요\"라고 말하기, 손으로 가리키기.",
      "\"기다리기\"를 조금씩 가르쳐주세요. 처음에는 아주 짧게 시작해 기다리는 시간을 점차 늘려가세요.",
      "차례 지키기와 나눠 쓰기도 함께 알려주세요. 특히 형제나 친구와 함께 있을 때 필요합니다.",
    ],
    respond: [
      "문제행동을 할 때는 원하는 것을 주지 마세요. 그러면 \"이렇게 하면 얻는구나\"를 배우게 됩니다.",
      "대신 바르게 요청하면 바로 주세요. \"주세요\"라고 말하거나 카드를 건네면 즉시 반응해주세요.",
      "정해진 시간 동안 잘 기다리면 원하는 것을 주세요. 기다림이 통한다는 것을 배우게 해주세요.",
    ],
  },
  physical: {
    why: "아이가 이런 행동을 하는 것은 몸이 아프거나 불편해서일 수 있습니다. 말이나 표현으로 \"아파요\"를 전하지 못해, 행동으로 그 불편을 드러내는 것입니다. 그래서 컨디션이 나쁜 날이나 특정 상황에서 행동이 더 늘어나곤 합니다.",
    prevent: [
      "가장 먼저 병원 진료로 몸에 아픈 곳이 없는지 확인해주세요. 중이염, 치통, 배앓이, 두통, 알레르기, 수면 문제 등 아이가 말로 표현하기 어려운 불편이 원인일 수 있습니다. 행동을 다루기 전에 이 확인이 우선입니다.",
      "행동이 심해지는 때(특정 시간, 식사 전후, 잠이 부족한 날 등)를 기록해두면 원인을 찾는 데 도움이 됩니다. 병원에 갈 때 이 기록을 함께 보여주세요.",
      "배고픔, 피로, 더위·추위 같은 기본적인 불편을 미리 해소해주세요. 규칙적인 식사와 충분한 수면·휴식이 특히 중요합니다.",
      "아플 것으로 예상되는 상황(치료, 특정 활동) 전에는 미리 알려주고 편안하게 해주세요.",
    ],
    teach: [
      "\"아파요\", \"도와주세요\"를 말이나 카드로 표현하도록 알려주세요. 아픈 곳을 손으로 가리키게 하거나, 웃는 얼굴·우는 얼굴 그림으로 아픈 정도를 표현하게 하는 것도 좋습니다.",
      "아이가 불편을 알리면 바로 살펴보고 도와주세요. 그래야 힘든 행동 대신 표현으로 도움을 받는 법을 배웁니다.",
      "조용하고 편안한 공간에서 쉬거나 심호흡으로 진정하는 방법을 알려주세요. (다만 아픈 것 자체는 병원에서 다뤄야 합니다.)",
    ],
    respond: [
      "아이가 아프다고 표현하면 바로 확인하고 필요한 도움을 주세요.",
      "이 행동을 혼내거나 벌주지 마세요. 아파서 하는 행동일 수 있으니, 먼저 안전을 살피고 불편한 원인을 찾아주세요.",
      "행동이 심한 정도와 아이의 몸 상태를 함께 기록해 병원 진료 때 알려주세요. 몸이 나아진 뒤에도 행동이 남으면 전문가와 다시 상의해주세요.",
    ],
  },
};

// 기능별 중재 라이브러리 — ABA 표준 4구성
const INTERVENTION_LIB = {
  attention: {
    hypothesis: (name, beh) => `${name}${K(name,"은","는")} 주변 어른이나 또래의 관심이 부족할 때 ${beh}${K(beh,"을","를")} 통해 관심을 얻으려는 것으로 추정됩니다. 즉, 이 행동은 '나를 봐 주세요'라는 기능을 합니다.`,
    antecedent: [
      "도전적 행동이 없을 때 미리, 자주(예: 5~10분마다) 긍정적 관심을 준다 (비유관 관심, NCR). 관심을 얻으려 행동할 필요 자체를 줄인다.",
      "관심을 받을 수 있는 시점을 미리 예고한다. 예: '5분 동안 혼자 해보고, 다 하면 선생님이 크게 칭찬해줄게'로 예측 가능성을 높인다.",
      "아동이 바르게 행동하는 순간을 놓치지 않고 즉시 구체적으로 언급한다 (행동 특정적 칭찬). 예: '조용히 앉아서 기다렸구나!'",
      "관심 밀도가 낮아지는 시간대(교사가 바쁜 시간, 개별활동 시간 등)를 파악해 그때 관심 제공 방법을 미리 계획한다.",
      "또래의 긍정적 관심을 활용한다. 예: 짝활동·도우미 역할을 배정해 적절한 방식으로 관심을 얻을 기회를 만든다.",
      "긍정적 관심과 부정적 관심(꾸중)의 비율을 최소 4:1 이상으로 유지하도록 계획한다.",
    ],
    replacement: [
      "관심을 적절히 요청하는 방법을 가르친다 (기능적 의사소통 훈련, FCT). 예: 손 들기, '봐 주세요' 말하기, 도움카드 건네기.",
      "적절한 요청에는 즉각적이고 풍부하게 반응해, 새 행동이 도전적 행동보다 빠르고 확실하게 관심을 얻도록 한다 (반응효율성).",
      "기다리는 방법을 함께 가르친다. 예: '기다리는 중' 카드를 쥐고 잠시 기다리면 관심을 제공한다 (지연 감내 훈련).",
      "요청 행동을 처음엔 촉구로 이끌고 점차 촉구를 용암시켜 스스로 하게 한다 (촉구 용암).",
      "적절한 관심요청이 다양한 상황·사람에게 일반화되도록 여러 장면에서 연습한다.",
    ],
    consequence: [
      "도전적 행동에는 계획된 무관심(소거)을 적용한다 — 눈맞춤·말·표정 반응을 최소화한다. (단, 안전이 위협되면 최소한의 중립적 개입)",
      "적절한 관심요청 행동에는 즉시 관심으로 반응한다 (대체행동 차별강화, DRA).",
      "도전적 행동이 없는 시간 간격에 관심을 제공한다 (타행동 차별강화, DRO). 간격은 짧게 시작해 점차 늘린다.",
      "소거 초기에 나타날 수 있는 소거 폭발(일시적 행동 증가)을 예상하고 일관되게 대응한다.",
      "무관심 후 적절 행동이 나오는 즉시 관심을 주어, '적절 행동 → 관심'의 연결을 분명히 학습시킨다.",
    ],
  },
  escape: {
    hypothesis: (name, beh) => `${name}${K(name,"은","는")} 어렵거나 하기 싫은 과제·요구가 제시될 때 그 상황에서 벗어나기 위해 ${beh}${K(beh,"을","를")} 보이는 것으로 추정됩니다. 즉, 이 행동은 '이걸 그만하고 싶어요'라는 기능을 합니다.`,
    antecedent: [
      "과제 난이도를 아동 수준에 맞게 조정하고 성공 경험을 먼저 제공한다 (행동 탄력, behavioral momentum: 쉬운 과제 여러 개 → 어려운 과제).",
      "과제를 작게 나누고 중간에 계획된 짧은 휴식을 미리 넣는다 (과제 분할).",
      "선택 기회를 준다. 예: '수학 먼저 할래, 읽기 먼저 할래?' — 통제감을 주어 회피 동기를 낮춘다.",
      "시각적 일정표로 과제의 시작·끝·쉬는 시간을 예측 가능하게 한다 (예: '먼저-그다음' 카드).",
      "지루하거나 과도한 반복 과제를 줄이고, 아동의 흥미·강점을 과제에 반영한다 (과제 흥미도 조정).",
      "요구 방식을 부드럽게 한다. 예: 지시를 명확·간결하게, 예고 후 제시하고, 완료 기준을 분명히 보여준다.",
    ],
    replacement: [
      "적절하게 휴식을 요청하는 방법을 가르친다 (기능적 의사소통 훈련, FCT). 예: '쉬고 싶어요' 카드 교환, '쉬어요' 말하기.",
      "도움을 요청하는 방법을 가르친다. 예: '도와주세요' 카드·말하기로, 어려울 때 회피 대신 도움을 구하게 한다.",
      "요청 시 즉시 짧은 휴식·도움을 제공해, 새 행동이 도전적 행동보다 효율적으로 회피 기능을 하도록 한다 (반응효율성).",
      "정해진 만큼 과제를 하면 쉴 수 있음을 배우게 한다 (지연 감내: 휴식 요청 후 조금씩 기다리는 시간을 늘린다).",
      "요청 행동을 촉구로 이끈 뒤 점차 촉구를 용암시켜 독립적으로 사용하게 한다 (촉구 용암).",
    ],
    consequence: [
      "도전적 행동으로는 과제에서 벗어나지 못하게 한다 (회피 소거, escape extinction: 행동 후에도 과제를 지속·완료하게 한다).",
      "적절한 휴식·도움 요청, 과제 참여에는 즉시 휴식·강화를 제공한다 (대체행동 차별강화, DRA).",
      "정해진 양의 과제를 완수하면 선호 활동을 제공한다 (프리맥 원리).",
      "도전적 행동이 없는 시간 간격에 강화한다 (타행동 차별강화, DRO).",
      "회피 소거 적용 시 소거 폭발과 정서 반응을 예상하고, 촉구·난이도 조정을 병행해 좌절을 최소화한다.",
    ],
  },
  sensory: {
    hypothesis: (name, beh) => `${name}의 ${beh}${K(beh,"은","는")} 특정 감각적 자극 자체가 주는 만족 때문에 유지되는 것으로 추정됩니다(자동강화). 주변에 사람이 없어도 나타나는 경향이 이를 뒷받침합니다.`,
    antecedent: [
      "유사한 감각을 주는 적절한 대체 활동을 환경에 풍부하게 배치한다 (환경 풍부화). 예: 촉각 자극이면 촉감 놀잇감·씹기 목걸이, 전정 자극이면 짐볼·흔들의자를 손 닿는 곳에 둔다.",
      "선호 감각활동을 정해진 시간에 무조건적으로 제공한다 (비유관 강화, NCR). 예: 20분마다 2분씩 감각놀이를 일정에 넣어, 행동으로 자극을 얻을 필요 자체를 줄인다.",
      "하루 일과에 감각 욕구를 규칙적으로 채우는 활동을 배분한다 (감각 식단, sensory diet). 작업치료사와 협의해 각성 수준에 맞는 활동을 시간표로 만든다.",
      "감각추구가 심해지는 선행조건(피곤·배고픔·소음·무료한 대기시간 등)을 파악해 미리 조정한다 (동기조작, MO).",
      "과제·활동을 감각적으로 흥미롭게 구성해 몰입도를 높인다. 예: 촉감 교구, 움직임이 포함된 학습활동으로 자기자극의 필요를 낮춘다.",
      "자극이 단조로운 대기·전이 시간을 최소화하고, 비는 시간에 할 수 있는 감각활동을 미리 정해둔다.",
    ],
    replacement: [
      "사회적으로 수용 가능하고 유사한 감각을 얻는 대체행동을 가르친다 (기능적 등가 훈련). 예: 손 흔들기 → 피젯토이 조작, 물건 입에 넣기 → 씹기 목걸이.",
      "감각 도구를 스스로 요청·사용하도록 지도한다 (기능적 의사소통 훈련, FCT). 예: '쉬는 시간'·'감각 도구' 카드를 교환하면 도구를 제공한다.",
      "대체행동이 도전적 행동만큼, 혹은 그 이상으로 감각 만족을 주도록 조정한다 (대체행동의 반응효율성 확보).",
      "스스로 각성을 조절하는 자기관리 기술을 가르친다. 예: '멈추기 → 숨쉬기 → 감각 도구 쓰기' 순서 카드로 자기조절을 연습시킨다.",
      "대체행동을 처음엔 촉구로 이끌고 점차 촉구를 용암시켜 독립적으로 사용하게 한다 (촉구 용암).",
    ],
    consequence: [
      "대체 감각활동에 참여할 때 즉시·풍부하게 강화한다 (대체행동 차별강화, DRA).",
      "도전적 행동이 없는 시간 간격에 강화를 제공한다 (타행동 차별강화, DRO). 간격은 현재 행동 빈도에 맞춰 짧게 시작해 점차 늘린다.",
      "가능한 경우 그 행동이 주는 감각 자극을 차단·감소시킨다 (감각 소거). 예: 소리가 강화라면 방음, 촉감이면 재질 변경 — 반드시 안전 범위 내에서.",
      "도전적 행동에는 감각적 결과를 최소화하고 반응을 중립적으로 유지한다 (관심·반응이 부가 강화가 되지 않도록).",
      "강화 효과를 유지하기 위해 대체 감각활동의 종류를 주기적으로 바꿔 포화를 방지한다. ※ 자동강화는 소거가 어려우므로 대체행동 교수와 환경조정이 핵심이다.",
    ],
  },
  tangible: {
    hypothesis: (name, beh) => `${name}${K(name,"은","는")} 원하는 물건·음식·활동을 얻지 못하거나 빼앗겼을 때 이를 얻기 위해 ${beh}${K(beh,"을","를")} 보이는 것으로 추정됩니다. 즉, '그걸 갖고 싶어요'라는 기능을 합니다.`,
    antecedent: [
      "선호물 이용 규칙과 시간을 시각적으로 미리 안내한다 (예: 타이머, '이따가' 카드, '지금-다음' 시각판).",
      "선호물 종료(전이) 전에 미리 예고하고, 다음에 다시 할 수 있음을 알려준다 (전이 예고).",
      "선호물을 적절히 요청할 수 있는 기회를 하루 중 자주 만든다 (요청 기회 삽입).",
      "원하는 것을 규칙적으로 미리 제공해 결핍 상태를 줄인다 (비유관 강화, NCR).",
      "선호물을 둘러싼 갈등 상황(뺏김·순서 기다림)을 예측해, 순서판·차례 카드로 미리 구조화한다.",
      "'안 돼요'만 반복하기보다, 언제·어떻게 얻을 수 있는지를 함께 알려준다 (대안 제시).",
    ],
    replacement: [
      "원하는 것을 적절히 요청하는 방법을 가르친다 (기능적 의사소통 훈련, FCT). 예: 그림교환 PECS, '주세요' 말하기, 요청 카드.",
      "'기다리기'를 단계적으로 가르친다 (지연 감내 훈련: 짧은 대기부터 시작해 점차 늘린다).",
      "'지금은 안 되지만 이따가 가능'을 이해하도록 시각 지원과 함께 지도한다 (지금-다음 전략).",
      "차례 지키기·나눠 쓰기 등 사회적 기술을 함께 가르친다 (또래 상황 대비).",
      "요청 행동을 촉구로 이끈 뒤 점차 촉구를 용암시켜 스스로 요청하게 한다 (촉구 용암).",
    ],
    consequence: [
      "도전적 행동으로는 원하는 물건을 얻지 못하게 한다 (소거: 행동 후 선호물을 제공하지 않는다).",
      "적절한 요청에는 즉시 선호물을 제공한다 (대체행동 차별강화, DRA).",
      "정해진 시간 동안 도전적 행동 없이 기다리면 선호물을 제공한다 (타행동 차별강화 DRO·지연강화).",
      "소거 초기의 소거 폭발을 예상하고 일관되게 대응한다 (선호물을 절대 행동 뒤에 주지 않는다).",
      "'적절 요청 → 획득'의 연결이 분명해지도록, 요청 직후 제공 시점을 놓치지 않는다.",
    ],
  },
  physical: {
    hypothesis: (name, beh) => `${name}의 ${beh}${K(beh,"은","는")} 신체적 불편·통증 등 내부의 고통 상태에서 벗어나기 위해 나타나는 것으로 추정됩니다(자동 부적강화). 특정 신체 부위와 관련되거나, 컨디션이 나쁜 날 증가하는 경향이 이를 뒷받침합니다. ※ 행동중재에 앞서 의학적 원인 평가가 우선되어야 합니다.`,
    antecedent: [
      "가장 먼저, 의학적 원인을 평가·배제한다. 소아과·치과·이비인후과 등 의료적 의뢰를 통해 통증·질환(중이염, 치통, 위장문제, 두통, 알레르기 등)·수면·투약 부작용을 우선 확인한다. (행동중재보다 의료적 조치가 선행)",
      "통증·불편이 심해지는 조건을 기록·파악한다 (예: 특정 시간대, 식사 전후, 수면 부족, 특정 자세·소음). ABC 기록에 신체 상태·컨디션을 함께 남긴다.",
      "확인된 불편 요인을 미리 조정한다. 예: 배고픔·갈증·피로·과열·소음 등 생리적 불편을 사전에 해소하고, 규칙적인 식사·수면·휴식 리듬을 확보한다.",
      "통증이 예상되는 상황(치료·처치·특정 활동) 전에는 예고와 진정 지원을 제공해 불필요한 각성을 낮춘다.",
      "의료진과 협의해 통증 관리 계획(투약 시간, 처치 방법)을 일과에 반영한다.",
    ],
    replacement: [
      "불편·아픔을 적절히 표현하는 방법을 가르친다 (기능적 의사소통 훈련, FCT). 예: '아파요'·'도와주세요' 말하기·카드, 아픈 부위 가리키기, 통증 척도(얼굴 그림) 사용.",
      "아이가 불편을 알리면 즉시 반응해 확인·지원한다. 그래야 도전적 행동 대신 표현으로 도움을 얻는 법을 배운다 (반응효율성).",
      "스스로 진정·완화하는 방법을 지도한다. 예: 조용한 공간으로 이동, 심호흡, 편안한 자세 취하기 (단, 통증 자체는 의료적으로 다룬다).",
      "표현 행동을 처음엔 촉구로 이끌고 점차 촉구를 용암시켜 스스로 알리게 한다 (촉구 용암).",
    ],
    consequence: [
      "불편을 적절히 표현하면 즉시 확인하고 필요한 지원(휴식·의료적 조치·위로)을 제공한다 (대체행동 차별강화, DRA).",
      "도전적 행동을 '벌'로 다루지 않는다. 통증 신호일 수 있으므로, 안전을 확보하고 불편 원인을 확인하는 방향으로 반응한다.",
      "통증·불편 정도와 도전적 행동의 관계를 지속적으로 데이터로 수집해 의료진과 공유한다.",
      "의학적 원인이 확인·조절된 뒤에도 행동이 남으면, 그때 다른 기능(감각·회피·관심 등)에 대한 재평가를 실시한다.",
      "※ 신체적 기능이 의심되는 동안에는 감각 소거·회피 소거 같은 소거 절차를 적용하지 않는다 (실제 통증을 방치할 위험).",
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
    hypothesis: (name, beh) => `${name}${K(name,"은","는")} 교실에서 교사나 또래의 관심이 부족할 때 ${beh}${K(beh,"을","를")} 통해 관심을 얻으려는 것으로 추정됩니다. 학급 전체를 지도하는 교사가 개별 관심을 주기 어려운 상황이 이 행동을 강화할 수 있습니다.`,
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
      "도전적 행동에는 최소한의 반응(계획된 무관심)을 하되, 학급 흐름이 끊기지 않게 비언어적 신호로 처리한다.",
      "바르게 참여하는 순간을 놓치지 않고 즉시 구체적으로 칭찬한다 (행동 특정적 칭찬 — 학급 전체에도 모델이 됨).",
      "개별 즉각강화가 어려우므로, 토큰·스티커판 같은 시각적 누적강화로 지연강화를 운영한다.",
    ],
  },
  escape: {
    hypothesis: (name, beh) => `${name}${K(name,"은","는")} 수업 과제가 어렵거나 길게 느껴질 때 그 상황에서 벗어나기 위해 ${beh}${K(beh,"을","를")} 보이는 것으로 추정됩니다. 개별 난이도 조정이 어려운 학급 수업 특성상 회피 동기가 커질 수 있습니다.`,
    antecedent: [
      "과제를 작은 단위로 나누고, 완료 지점을 시각적으로 표시한다 (예: 체크리스트, '여기까지' 표시).",
      "이 학생에게는 분량·난이도를 사전에 조정한 과제를 준비한다 (수정된 과제, 또래와 다른 양이어도 무방).",
      "수업 일과와 과제 순서를 시각적 일정표로 제시해 예측 가능성을 높인다.",
      "쉬운 과제로 시작해 성공 경험을 준 뒤 어려운 과제로 넘어간다 (행동 탄력).",
      "정해진 조건에서 '휴식 패스'를 쓸 수 있게 한다 (교실 안에서 허용된 방식으로 잠깐 쉬는 방법).",
    ],
    replacement: [
      "적절히 도움·휴식을 요청하는 방법을 가르친다 (예: '도와주세요/쉬고 싶어요' 카드, 책상 위 신호판).",
      "요청 시 짧은 휴식이나 대안 과제를 허용해, 도전적 행동보다 요청이 더 쉽게 통하도록 만든다.",
    ],
    consequence: [
      "가능한 범위에서 도전적 행동으로 과제를 완전히 회피하지는 못하게 한다 (예: 양을 줄여서라도 최소한 참여 후 종료).",
      "적절한 요청·참여에는 즉시 휴식·강화를 준다 (DRA).",
      "정해진 분량을 마치면 선호 활동을 하게 한다 (프리맥 — 학급 공통 규칙으로 운영하면 관리 쉬움).",
      "일관된 소거가 어려운 환경이므로, 교사·특수교사·보조인력이 대응 방식을 미리 통일해 둔다.",
    ],
  },
  sensory: {
    hypothesis: (name, beh) => `${name}의 ${beh}${K(beh,"은","는")} 특정 감각자극 자체가 주는 만족 때문에 유지되는 것으로 추정됩니다(자동강화). 수업 중 자극이 단조롭거나 대기 시간이 길 때 더 나타날 수 있습니다.`,
    antecedent: [
      "수업 중 사용할 수 있는 조용한 감각 도구를 허용한다 (예: 피젯토이, 무릎담요, 씹기 목걸이 — 수업 방해 없는 것으로).",
      "대기·전이 시간을 줄이고, 할 일을 명확히 주어 '빈 시간'을 최소화한다.",
      "쉬는 시간이나 정해진 시점에 감각욕구를 충분히 충족할 기회를 준다 (감각 식단).",
      "좌석 위치·조명·소음 등 교실 환경에서 과잉/과소 자극 요인을 조정한다.",
    ],
    replacement: [
      "수업에 방해되지 않으면서 비슷한 감각을 얻는 대체행동을 가르친다 (예: 소리내기 → 피젯 조작, 자리이탈 → 정해진 스트레칭).",
      "감각 도구 사용 규칙(언제·어떻게)을 명확히 정해 자기관리로 연결한다.",
    ],
    consequence: [
      "자동강화는 소거가 어려우므로, 환경조정과 대체도구가 핵심임을 교사와 공유한다.",
      "대체도구를 적절히 사용할 때 인정·강화한다 (DRA).",
      "도전적 행동이 적은 시간대·상황을 파악해, 그 조건을 수업 전반으로 확대 적용한다.",
    ],
  },
  tangible: {
    hypothesis: (name, beh) => `${name}${K(name,"은","는")} 원하는 물건·활동을 얻지 못하거나 순서를 기다려야 할 때 ${beh}${K(beh,"을","를")} 보이는 것으로 추정됩니다. 학급에서는 자원(교구·컴퓨터·차례)이 공유되므로 이런 상황이 자주 생깁니다.`,
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
      "도전적 행동으로는 원하는 것을 얻지 못하게 하되, 학급 규칙으로 일관되게 적용한다.",
      "적절한 요청·기다림에는 약속대로 선호물·차례를 제공한다 (DRA).",
      "차례를 잘 지키거나 기다린 것을 학급 차원에서 인정·강화한다 (집단강화로 관리 부담 완화).",
    ],
  },
  physical: {
    hypothesis: (name, beh) => `${name}의 ${beh}${K(beh,"은","는")} 신체적 불편·통증 등 내부의 고통에서 벗어나기 위한 것으로 추정됩니다(자동 부적강화). 컨디션이 나쁜 날 증가하거나 특정 신체 부위와 관련되는 경향이 이를 뒷받침합니다. ※ 교내 대응에 앞서 의료적 원인 확인이 우선입니다.`,
    antecedent: [
      "먼저 보건교사·보호자와 협력해 의료적 원인(통증·질환·수면·투약)을 확인하도록 의뢰한다. 교사는 행동중재보다 의료적 조치가 선행되어야 함을 인지한다.",
      "불편이 심해지는 조건(특정 시간대, 식사·수면 상태, 자세, 소음 등)을 관찰·기록해 보호자·보건교사와 공유한다.",
      "확인된 생리적 불편(배고픔·피로·과열·갈증 등)을 학급 일과에서 미리 조정한다 (수분·간식·휴식 시간 확보, 자리·환경 조정).",
      "필요 시 보건실 이용·휴식 절차를 미리 정해 두어, 불편할 때 안전하게 쉴 수 있게 한다.",
    ],
    replacement: [
      "불편·아픔을 적절히 알리는 방법을 가르친다 (예: '아파요'·'보건실 가고 싶어요' 카드·손신호, 아픈 부위 가리키기).",
      "학생이 불편을 알리면 즉시 확인하고 보건실 이용 등 지원으로 연결한다 (반응효율성).",
    ],
    consequence: [
      "불편을 적절히 표현하면 즉시 확인·지원한다 (DRA). 도전적 행동을 벌로 다루지 않는다.",
      "통증 신호일 수 있으므로 소거 절차를 적용하지 않고, 안전 확보와 원인 확인을 우선한다.",
      "행동과 신체 상태의 관계를 기록해 보호자·보건교사·의료진과 공유하고, 의학적 원인이 배제된 뒤 기능을 재평가한다.",
    ],
  },
};

// 완료된 평가들 → 통합 기능 집계 (가장 우세한 기능 판정)
function aggregateFunction(assessments) {
  if (!assessments || assessments.length === 0) return null;
  const tally = { attention: 0, escape: 0, sensory: 0, tangible: 0, physical: 0 }; // 1위 표수(기존 호환)
  const scoreSum = { attention: 0, escape: 0, sensory: 0, tangible: 0, physical: 0 }; // 정규화 점수 합
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

  // 점수 기반 순위 (주기능 및 1차/2차/별도 계층 판정의 단일 기준)
  const scoreRanked = Object.entries(scoreSum)
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1]);

  // 주기능: 점수(scoreSum) 1위로 통일 (tier 1차와 항상 일치)
  const primary = scoreRanked.length ? scoreRanked[0][0] : null;

  // 1위 표수 순위 (참고용, 기존 호환)
  const ranked = Object.entries(tally).sort((x, y) => y[1] - x[1]);

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

  // 주기능이 모호한가: 2위 점수가 1위의 90% 이상이면 동점에 가까움 → 사용자 확인 권장
  const secondScore = scoreRanked.length > 1 ? scoreRanked[1][1] : 0;
  const ambiguous = topScore > 0 && secondScore >= topScore * 0.9;
  const ambiguousFuncs = ambiguous
    ? scoreRanked.filter(([, v]) => v >= topScore * 0.9).map(([f]) => f)
    : [];

  return { primary, tally, detail, ranked, scoreSum, scoreRanked, tiers, topScore, ambiguous, ambiguousFuncs };
}

// BIP 생성 (템플릿 조합) — setting: 'center' | 'pbs'
function generateBIP(func, childName, targetBeh, setting) {
  const lib = (setting === "pbs" ? INTERVENTION_LIB_SCHOOL : INTERVENTION_LIB)[func];
  if (!lib) return null;
  const name = displayName(childName);
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

// ── 라우터: #/fill/{token} 이면 외부 작성 페이지, 아니면 앱 ──
export default function App() {
  const [hash, setHash] = useState(typeof window !== "undefined" ? window.location.hash : "");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // #/fill/{token}  (척도id는 토큰 안에 들어있으므로 토큰만 파싱)
  const m = hash.match(/^#\/fill\/(.+)$/);
  if (m) {
    // 경로가 #/fill/{scale}/{token} 형태일 수도 있어 마지막 세그먼트를 토큰으로 사용
    const parts = m[1].split("/");
    const token = parts[parts.length - 1];
    return <ExternalFillPage token={token} />;
  }
  return <MainApp />;
}

function MainApp() {
  // ── 인증 상태 (Supabase Auth) ──
  const [authUser, setAuthUser] = useState(null); // {id, email, name, role}
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");

  // ── 데이터 ──
  const [cases, setCases] = useState([]);          // 화면에 보이는 전체(관리자=전체, 선생님=본인)
  const [loaded, setLoaded] = useState(false);
  const didHydrate = React.useRef(false);
  const hadCasesAtLoad = React.useRef(false);

  const [tab, setTab] = useState("center");
  const [selectedId, setSelectedId] = useState(null);

  const isAdmin = authUser?.role === "admin";

  // 세션 복원 (앱 시작 시)
  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user?.id) {
        const meta = user.user_metadata || {};
        setAuthUser({
          id: user.id,
          email: user.email,
          name: meta.display_name || user.email.split("@")[0],
          role: meta.role || "therapist",
        });
      }
      setAuthLoading(false);
    })();
  }, []);

  // 로그인 성공 후 데이터 로드
  useEffect(() => {
    if (!authUser?.id) { setCases([]); setLoaded(false); didHydrate.current = false; return; }
    (async () => {
      setLoaded(false);
      didHydrate.current = false;
      if (authUser.role === "admin") {
        // 관리자: 본인 것 + 모든 선생님 것 열람(합침). owner로 소유 구분.
        const all = [];
        // 본인 데이터
        const mine = await dataGet("cases");
        if (mine?.value) { try { (JSON.parse(mine.value) || []).forEach((c) => all.push({ ...c, _ownerId: authUser.id })); } catch (e) {} }
        // 다른 선생님 데이터 (RPC 열람)
        try {
          const users = await adminListUsers();
          for (const t of (users || [])) {
            if (t.user_id === authUser.id) continue;
            try {
              const rows = await adminGetUserData(t.user_id);
              const row = (rows || []).find((r) => r.key === "cases");
              if (row?.value) { (JSON.parse(row.value) || []).forEach((c) => all.push({ ...c, _ownerId: t.user_id })); }
            } catch (e) {}
          }
        } catch (e) {}
        setCases(all);
        hadCasesAtLoad.current = all.length > 0;
      } else {
        // 선생님: 본인 것만 (RLS 격리)
        const mine = await dataGet("cases");
        let arr = [];
        if (mine?.value) { try { arr = JSON.parse(mine.value) || []; } catch (e) {} }
        arr = arr.map((c) => ({ ...c, _ownerId: authUser.id }));
        setCases(arr);
        hadCasesAtLoad.current = arr.length > 0;
      }
      didHydrate.current = true;
      setLoaded(true);
    })();
  }, [authUser?.id]);

  // cases 저장: 본인 소유분만 dataSet (관리자가 열람 중인 남의 데이터는 저장 안 함)
  const persistCases = React.useCallback(async (nextCases) => {
    if (!authUser?.id) return;
    const mineOnly = nextCases.filter((c) => (c._ownerId || authUser.id) === authUser.id);
    const clean = mineOnly.map(({ _ownerId, ...rest }) => rest); // 내부 필드 제거
    await dataSet("cases", JSON.stringify(clean));
  }, [authUser?.id]);

  // cases 변경 시 자동 저장 (본인 소유분만)
  useEffect(() => {
    if (!didHydrate.current) return;
    if (cases.length === 0 && hadCasesAtLoad.current) {
      // 빈 배열: 본인 것이 실제로 0개가 됐을 때만 저장 (열람 데이터 유실 방지)
      const mineCount = cases.filter((c) => (c._ownerId || authUser?.id) === authUser?.id).length;
      if (mineCount === 0) persistCases(cases);
      return;
    }
    persistCases(cases);
  }, [cases]);

  // ── 로그인 처리 ──
  const handleLogin = async () => {
    const email = loginEmail.trim();
    const pw = loginPw.trim();
    if (!email || !pw) { setLoginError("이메일과 비밀번호를 입력하세요."); return; }
    setLoginError("");
    const result = await signInWithPassword(email, pw);
    if (result.error) {
      const err = result.error.toLowerCase();
      if (err.includes("invalid") || err.includes("credential")) setLoginError("이메일 또는 비밀번호가 일치하지 않습니다.");
      else if (err.includes("not confirmed")) setLoginError("이메일 확인이 필요합니다. 관리자에게 문의하세요.");
      else setLoginError(result.error);
      return;
    }
    const user = result.user;
    const meta = user?.user_metadata || {};
    setAuthUser({
      id: user.id,
      email: user.email,
      name: meta.display_name || user.email.split("@")[0],
      role: meta.role || "therapist",
    });
    setLoginEmail(""); setLoginPw("");
  };

  const handleLogout = async () => {
    setAuthUser(null);
    setCases([]);
    setSelectedId(null);
    setLoginEmail(""); setLoginPw(""); setLoginError("");
    await signOut();
  };

  // 로딩 중
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: PKL, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard', -apple-system, sans-serif", color: MUTE }}>
        불러오는 중...
      </div>
    );
  }

  // 로그인 전
  if (!authUser) {
    return (
      <AuthGate
        email={loginEmail} setEmail={setLoginEmail}
        pw={loginPw} setPw={setLoginPw}
        error={loginError} onLogin={handleLogin}
      />
    );
  }

  const current = { role: authUser.role, name: authUser.name };

  // 소유 판별: 관리자여도 본인 소유(_ownerId===authUser.id)만 수정 가능
  const canEdit = (c) => (c._ownerId || authUser.id) === authUser.id;

  // 화면에 보이는 케이스 (탭 기준). 관리자=전체, 선생님=본인(이미 본인만 로드됨)
  const visible = cases.filter((c) => c.type === tab);

  const selectedCase = selectedId ? cases.find((c) => c.id === selectedId) : null;

  // 기록/평가/케이스 헬퍼 (본인 소유만 수정)
  const addRecord = (caseId, rec) =>
    setCases((prev) => prev.map((c) => c.id === caseId && canEdit(c) ? { ...c, records: [{ ...rec, id: Date.now() }, ...(c.records || [])] } : c));
  const removeRecord = (caseId, recId) =>
    setCases((prev) => prev.map((c) => c.id === caseId && canEdit(c) ? { ...c, records: (c.records || []).filter((r) => r.id !== recId) } : c));
  const addAssessment = (caseId, asmt) =>
    setCases((prev) => prev.map((c) => c.id === caseId && canEdit(c) ? { ...c, assessments: [{ ...asmt, id: Date.now() }, ...(c.assessments || [])] } : c));
  const removeAssessment = (caseId, asmtId) =>
    setCases((prev) => prev.map((c) => c.id === caseId && canEdit(c) ? { ...c, assessments: (c.assessments || []).filter((a) => a.id !== asmtId) } : c));
  const updateCase = (caseId, patch) =>
    setCases((prev) => prev.map((c) => c.id === caseId && canEdit(c) ? { ...c, ...patch } : c));

  const removeCase = (caseId) => {
    setCases((prev) => {
      const target = prev.find((c) => c.id === caseId);
      if (target && !canEdit(target)) return prev; // 남의 케이스는 삭제 불가
      const next = prev.filter((c) => c.id !== caseId);
      hadCasesAtLoad.current = next.filter((c) => (c._ownerId || authUser.id) === authUser.id).length > 0;
      return next;
    });
    setSelectedId(null);
  };

  // 상세 화면
  if (selectedCase) {
    const editable = canEdit(selectedCase);
    return (
      <div style={{ minHeight: "100vh", background: PKL, fontFamily: "'Pretendard', -apple-system, sans-serif", color: INK, display: "flex", flexDirection: "column" }}>
        <Header current={current} isAdmin={isAdmin} onLogout={handleLogout} />
        <div style={{ flex: 1, maxWidth: 860, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "0 16px 40px" }}>
          <CaseDetail
            c={selectedCase}
            isAdmin={isAdmin}
            readOnly={!editable}
            onBack={() => setSelectedId(null)}
            onAddRecord={(rec) => addRecord(selectedCase.id, rec)}
            onRemoveRecord={(recId) => removeRecord(selectedCase.id, recId)}
            onAddAssessment={(asmt) => addAssessment(selectedCase.id, asmt)}
            onRemoveAssessment={(aid) => removeAssessment(selectedCase.id, aid)}
            onUpdateCase={(patch) => updateCase(selectedCase.id, patch)}
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
        {isAdmin && <AdminPanel />}

        <div style={{ display: "flex", gap: 8, margin: "18px 0" }}>
          <TabBtn active={tab === "center"} onClick={() => setTab("center")}>
            센터 아동 <Badge>{cases.filter((c) => c.type === "center").length}</Badge>
          </TabBtn>
          <TabBtn active={tab === "pbs"} onClick={() => setTab("pbs")}>
            PBS 아동 <Badge>{cases.filter((c) => c.type === "pbs").length}</Badge>
          </TabBtn>
        </div>

        <CaseList
          tab={tab}
          isAdmin={isAdmin}
          cases={visible}
          onSelect={(id) => setSelectedId(id)}
          onAdd={(nc) => setCases((prev) => { hadCasesAtLoad.current = true; return [...prev, { ...nc, id: Date.now(), type: tab, owner: authUser.name, _ownerId: authUser.id, createdAt: today(), records: [], assessments: [] }]; })}
        />
      </div>

      <Footer />
    </div>
  );
}

// ── 인증 게이트: 이메일+비번 로그인 ───────
function AuthGate({ email, setEmail, pw, setPw, error, onLogin }) {
  const [busy, setBusy] = useState(false);
  const doLogin = async () => {
    setBusy(true);
    try { await onLogin(); } finally { setBusy(false); }
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

        {/* 브라우저 자동완성 차단용 미끼 필드 (화면에 보이지 않음) */}
        <input type="text" name="username" tabIndex={-1} aria-hidden="true" autoComplete="username" style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none", zIndex: -1 }} />
        <input type="password" name="password" tabIndex={-1} aria-hidden="true" autoComplete="current-password" style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none", zIndex: -1 }} />
        <Field label="이메일" value={email} onChange={setEmail} placeholder="이메일" type="email" autoComplete="off" />
        <Field label="비밀번호" value={pw} onChange={setPw} type="password" placeholder="비밀번호" onEnter={doLogin} autoComplete="new-password" />
        {error && <div style={{ color: PKD, fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <button onClick={doLogin} disabled={busy} style={{ ...btnPrimary, width: "100%", marginTop: 6, opacity: busy ? 0.6 : 1 }}>
          {busy ? "확인 중..." : "로그인"}
        </button>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed #e8d0d6", fontSize: 10.5, color: MUTE, textAlign: "center", lineHeight: 1.6 }}>
          계정이 필요하면 연구소 관리자에게 문의하세요.
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
function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = async () => {
    setLoading(true);
    const list = await adminListUsers();
    setUsers(list || []);
    setLoading(false);
  };

  useEffect(() => { if (open) refresh(); }, [open]);

  const add = async () => {
    const em = email.trim().toLowerCase();
    const nm = name.trim();
    if (!em || !em.includes("@")) return setMsg("올바른 이메일을 입력해 주세요.");
    if (!nm) return setMsg("선생님 이름을 입력해 주세요.");
    if (pw.length < 6) return setMsg("비밀번호는 6자 이상이어야 해요.");
    if (users.some((u) => u.email === em)) return setMsg("이미 등록된 이메일이에요.");
    setBusy(true);
    const result = await adminCreateUser(em, pw, nm);
    setBusy(false);
    if (result.error) return setMsg(result.error);
    setEmail(""); setName(""); setPw("");
    setMsg(`✓ ${nm} 선생님 계정을 추가했어요.`);
    await refresh();
  };

  const del = async (u) => {
    if (u.role === "admin") return;
    if (!window.confirm(`${u.display_name || u.email} 계정을 삭제할까요?`)) return;
    setBusy(true);
    const result = await adminDeleteUser(u.user_id);
    setBusy(false);
    if (result.error) return setMsg(result.error);
    setMsg("계정을 삭제했어요.");
    await refresh();
  };

  const resetPw = async (u) => {
    const np = window.prompt(`${u.display_name || u.email}의 새 비밀번호 (6자 이상)`);
    if (np == null) return;
    if (np.trim().length < 6) return setMsg("비밀번호는 6자 이상이어야 해요.");
    setBusy(true);
    const result = await adminUpdateUserPassword(u.user_id, np.trim());
    setBusy(false);
    setMsg(result.error ? result.error : "비밀번호를 변경했어요.");
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, marginTop: 18, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", overflow: "hidden" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 700, color: PKD }}>
        <span>⚙️ 선생님 계정 관리 <span style={{ color: MUTE, fontWeight: 400, fontSize: 12 }}>({users.length}명)</span></span>
        <span style={{ color: MUTE }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${PKL}` }}>
          <div style={{ display: "grid", gap: 6, margin: "12px 0" }}>
            {loading && <div style={{ fontSize: 12.5, color: MUTE }}>불러오는 중...</div>}
            {!loading && users.length === 0 && <div style={{ fontSize: 12.5, color: MUTE }}>계정이 없어요.</div>}
            {users.map((u) => (
              <div key={u.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: PKL, borderRadius: 8, padding: "8px 12px", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>
                  {u.role === "admin" ? "👑 " : "👩‍🏫 "}{u.display_name || u.email}
                  <span style={{ color: MUTE, fontWeight: 400, fontSize: 11.5, marginLeft: 6 }}>{u.email}</span>
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => resetPw(u)} disabled={busy} style={{ fontSize: 11.5, color: PKD, background: "none", border: `1px solid ${PK}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>비번변경</button>
                  {u.role !== "admin" && <button onClick={() => del(u)} disabled={busy} style={{ fontSize: 11.5, color: PKD, background: "none", border: `1px solid ${PK}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>삭제</button>}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px" }}>
                <div style={{ fontSize: 11, color: MUTE, marginBottom: 4, fontWeight: 600 }}>이메일</div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="예: teacher@geomdan.com" style={inputStyle} />
              </div>
              <div style={{ flex: "1 1 100px" }}>
                <div style={{ fontSize: 11, color: MUTE, marginBottom: 4, fontWeight: 600 }}>선생님 이름</div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 이선생" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 11, color: MUTE, marginBottom: 4, fontWeight: 600 }}>초기 비밀번호</div>
                <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="6자 이상" style={inputStyle} />
              </div>
              <button onClick={add} disabled={busy} style={{ ...btnPrimary, flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
                {busy ? "..." : "추가"}
              </button>
            </div>
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

function CaseDetail({ c, isAdmin, readOnly = false, onBack, onAddRecord, onRemoveRecord, onAddAssessment, onRemoveAssessment, onUpdateCase, onRemoveCase }) {
  const [showForm, setShowForm] = useState(false);
  const [section, setSection] = useState("record"); // record | assess | bip
  const [runningScale, setRunningScale] = useState(null); // 진행 중인 척도 id
  const [confirmDel, setConfirmDel] = useState(false);
  const [abcSubs, setAbcSubs] = useState([]);        // 받은 외부 ABC 제출
  const [abcSubsLoading, setAbcSubsLoading] = useState(false);
  const [abcImporting, setAbcImporting] = useState(null); // 반영 중인 sid
  const records = c.records || [];
  const assessments = c.assessments || [];
  const isPbs = c.type === "pbs";

  // 받은 외부 제출 중 ABC만 불러오기
  const loadAbcSubs = React.useCallback(async () => {
    setAbcSubsLoading(true);
    const list = await listExternalSubmissions(c.id);
    const abcOnly = (list || []).filter((s) => s.scaleId === "ABC");
    abcOnly.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    setAbcSubs(abcOnly);
    setAbcSubsLoading(false);
  }, [c.id]);

  useEffect(() => { loadAbcSubs(); }, [loadAbcSubs]);

  // 받은 ABC 1건 → 케이스 기록으로 반영 + 원본 삭제
  const importAbc = async (sub) => {
    setAbcImporting(sub.sid);
    const r = sub.record || {};
    onAddRecord({
      datetime: r.when || "",
      antecedent: r.antecedent || "",
      behavior: r.behavior || "",
      consequence: r.consequence || "",
      count: "1",
      severity: "",
      by: sub.writer || "외부",
      source: "external",
    });
    await deleteExternalSubmission(c.id, sub.sid);
    setAbcSubs((prev) => prev.filter((x) => x.sid !== sub.sid));
    setAbcImporting(null);
  };

  const dismissAbc = async (sub) => {
    await deleteExternalSubmission(c.id, sub.sid);
    setAbcSubs((prev) => prev.filter((x) => x.sid !== sub.sid));
  };

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

          <AbcLinkBox c={c} />

          {(abcSubsLoading || abcSubs.length > 0) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: PKD }}>
                📩 받은 ABC 기록 <span style={{ color: MUTE, fontWeight: 400, fontSize: 12.5 }}>({abcSubs.length})</span>
                <button onClick={loadAbcSubs} style={{ ...btnGhost, padding: "3px 9px", fontSize: 11, marginLeft: 8 }}>새로고침</button>
              </div>
              {abcSubsLoading && <div style={{ fontSize: 12.5, color: MUTE, padding: "6px 2px" }}>불러오는 중...</div>}
              <div style={{ display: "grid", gap: 10 }}>
                {abcSubs.map((sub) => {
                  const r = sub.record || {};
                  return (
                    <div key={sub.sid} style={{ background: "#fff", borderRadius: 12, padding: 14, border: `1.5px solid ${PKL}`, boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
                      <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 8 }}>
                        작성자 <b style={{ color: INK }}>{sub.writer || "외부"}</b>
                        {r.when ? ` · ${r.when}` : ""}
                        {sub.submittedAt ? ` · 제출 ${String(sub.submittedAt).slice(0, 10)}` : ""}
                      </div>
                      <div style={{ display: "grid", gap: 4, fontSize: 12.5, lineHeight: 1.6 }}>
                        {r.antecedent ? <div><b style={{ color: PKD }}>A</b> {r.antecedent}</div> : null}
                        {r.behavior ? <div><b style={{ color: PKD }}>B</b> {r.behavior}</div> : null}
                        {r.consequence ? <div><b style={{ color: PKD }}>C</b> {r.consequence}</div> : null}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={() => dismissAbc(sub)} disabled={abcImporting === sub.sid} style={{ ...btnGhost, flex: 1, fontSize: 12.5 }}>삭제</button>
                        <button onClick={() => importAbc(sub)} disabled={abcImporting === sub.sid} style={{ ...btnPrimary, flex: 2, fontSize: 12.5, opacity: abcImporting === sub.sid ? 0.6 : 1 }}>
                          {abcImporting === sub.sid ? "반영 중..." : "이 기록에 반영하기"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
          c={c}
          assessments={assessments}
          onStart={(scaleId) => setRunningScale(scaleId)}
          onRemove={onRemoveAssessment}
          onImport={onAddAssessment}
        />
      )}

      {section === "bip" && (
        <BIPSection c={c} assessments={assessments} onUpdateCase={onUpdateCase} />
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
  const [datetime, setDatetime] = useState("");
  const [antecedent, setAntecedent] = useState("");
  const [behavior, setBehavior] = useState("");
  const [consequence, setConsequence] = useState("");
  const [count, setCount] = useState("1");
  const [severity, setSeverity] = useState("");
  const [err, setErr] = useState("");
  const [photoState, setPhotoState] = useState("idle"); // idle | reading | error
  const [photoMsg, setPhotoMsg] = useState("");
  const fileRef = React.useRef(null);

  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setPhotoState("reading"); setPhotoMsg(""); setErr("");
    try {
      const r = await readAbcPhoto(file);
      if (r.when) setDatetime(r.when);
      if (r.antecedent) setAntecedent(r.antecedent);
      if (r.behavior) setBehavior(r.behavior);
      if (r.consequence) setConsequence(r.consequence);
      setPhotoState("idle");
      setPhotoMsg("사진에서 내용을 불러왔어요. 확인 후 수정·저장해 주세요.");
    } catch (ex) {
      setPhotoState("error");
      setPhotoMsg(ex.message || "사진 인식에 실패했어요.");
    }
  };

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

      <div style={{ marginBottom: 14 }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onPhoto} style={{ display: "none" }} />
        <button onClick={() => fileRef.current && fileRef.current.click()} disabled={photoState === "reading"}
          style={{ ...btnGhost, width: "100%", justifyContent: "center", padding: "10px", fontSize: 13, opacity: photoState === "reading" ? 0.6 : 1 }}>
          {photoState === "reading" ? "사진 읽는 중..." : "📷 사진으로 채우기 (손글씨·메모 인식)"}
        </button>
        {photoMsg ? (
          <div style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5, color: photoState === "error" ? "#D85A5A" : "#5C9A72" }}>{photoMsg}</div>
        ) : null}
      </div>

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
function AssessmentSection({ c, assessments, onStart, onRemove, onImport }) {
  const [linkScale, setLinkScale] = useState(null); // 링크 만들 척도
  const [subs, setSubs] = useState([]);             // 받은 외부 제출
  const [subsLoading, setSubsLoading] = useState(false);
  const [importing, setImporting] = useState(null); // 반영 중인 sid

  const loadSubs = React.useCallback(async () => {
    setSubsLoading(true);
    const list = await listExternalSubmissions(c.id);
    // ABC 제출은 기록 탭에서 처리하므로 평가 탭에서는 척도 설문만
    const scaleOnly = (list || []).filter((s) => s.scaleId !== "ABC");
    // 최신순
    scaleOnly.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    setSubs(scaleOnly);
    setSubsLoading(false);
  }, [c.id]);

  useEffect(() => { loadSubs(); }, [loadSubs]);

  // 받은 설문 1건 → 채점해서 평가 결과로 반영 + 원본 삭제
  const importSub = async (sub) => {
    setImporting(sub.sid);
    const scored = scoreAssessment(sub.scaleId, sub.answers);
    onImport({
      scaleId: sub.scaleId,
      date: today(),
      answers: sub.answers,
      results: scored.results,
      sorted: scored.sorted,
      top: scored.top,
      writer: sub.writer,
      source: "external",
      preInfo: sub.preInfo,
    });
    await deleteExternalSubmission(c.id, sub.sid);
    setSubs((prev) => prev.filter((x) => x.sid !== sub.sid));
    setImporting(null);
  };

  const dismissSub = async (sub) => {
    await deleteExternalSubmission(c.id, sub.sid);
    setSubs((prev) => prev.filter((x) => x.sid !== sub.sid));
  };

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
            {linkScale === s.id && <ExternalLinkBox scale={s} c={c} />}
          </div>
        ))}
      </div>

      {/* 받은 설문 (외부 제출) */}
      {(subsLoading || subs.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
            📩 받은 설문 <span style={{ color: MUTE, fontWeight: 400, fontSize: 13 }}>({subs.length})</span>
            <button onClick={loadSubs} style={{ ...btnGhost, padding: "4px 10px", fontSize: 11, marginLeft: 8 }}>새로고침</button>
          </div>
          {subsLoading && <div style={{ fontSize: 12.5, color: MUTE, padding: "8px 2px" }}>불러오는 중...</div>}
          <div style={{ display: "grid", gap: 10 }}>
            {subs.map((sub) => {
              const sc = SCALES[sub.scaleId];
              return (
                <div key={sub.sid} style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 2px 12px rgba(212,114,138,0.06)", border: `1.5px solid ${PKL}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: PKD }}>{sc ? sc.name : sub.scaleId}</div>
                      <div style={{ fontSize: 12, color: INK, marginTop: 3 }}>작성자: <b>{sub.writer || "미기재"}</b></div>
                      <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>제출 {sub.submittedAt ? String(sub.submittedAt).slice(0, 10) : ""}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => dismissSub(sub)} disabled={importing === sub.sid} style={{ ...btnGhost, flex: 1 }}>삭제</button>
                    <button onClick={() => importSub(sub)} disabled={importing === sub.sid} style={{ ...btnPrimary, flex: 2, opacity: importing === sub.sid ? 0.6 : 1 }}>
                      {importing === sub.sid ? "반영 중..." : "결과로 반영하기"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

// ── FAST 앞부분(preInfo) 입력 필드 렌더러 (센터·외부 공용) ──
function PreInfoFields({ fields, values, onChange }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {fields.map((fld) => {
        const val = values[fld.key];
        if (fld.type === "checkbox") {
          const arr = Array.isArray(val) ? val : [];
          const toggle = (opt) => {
            const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
            onChange(fld.key, next);
          };
          return (
            <div key={fld.key} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 8 }}>{fld.label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {fld.options.map((opt) => {
                  const sel = arr.includes(opt);
                  return (
                    <button key={opt} onClick={() => toggle(opt)}
                      style={{ padding: "7px 12px", borderRadius: 9, fontSize: 12.5, cursor: "pointer", fontWeight: sel ? 700 : 400,
                        border: sel ? `1.5px solid ${PKD}` : "1.5px solid #eadfe2",
                        background: sel ? PKL : "#fff", color: sel ? PKD : INK }}>
                      {sel ? "✓ " : ""}{opt}
                    </button>
                  );
                })}
              </div>
              {fld.hint ? <div style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>{fld.hint}</div> : null}
            </div>
          );
        }
        if (fld.type === "radio") {
          return (
            <div key={fld.key} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 8 }}>{fld.label}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {fld.options.map((opt) => {
                  const sel = val === opt;
                  return (
                    <button key={opt} onClick={() => onChange(fld.key, opt)}
                      style={{ textAlign: "left", padding: "8px 12px", borderRadius: 9, fontSize: 12.5, cursor: "pointer", fontWeight: sel ? 700 : 400,
                        border: sel ? `1.5px solid ${PKD}` : "1.5px solid #eadfe2",
                        background: sel ? PKL : "#fff", color: sel ? PKD : INK }}>
                      {sel ? "● " : "○ "}{opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
        if (fld.type === "textarea") {
          return (
            <div key={fld.key} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 8 }}>{fld.label}</div>
              <textarea value={val || ""} onChange={(e) => onChange(fld.key, e.target.value)}
                placeholder={fld.placeholder || ""} rows={2}
                style={{ ...inputStyle, resize: "vertical", minHeight: 48, fontFamily: "inherit" }} />
            </div>
          );
        }
        // text (default)
        return (
          <div key={fld.key} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 8 }}>{fld.label}</div>
            <input value={val || ""} onChange={(e) => onChange(fld.key, e.target.value)}
              placeholder={fld.placeholder || ""} style={inputStyle} />
          </div>
        );
      })}
    </div>
  );
}

// ── ABC 외부 작성 페이지 (로그인 없이, 여러 건 반복 제출) ─────
function AbcFillPage({ info }) {
  const [writer, setWriter] = useState("");
  const [antecedent, setAntecedent] = useState("");
  const [behavior, setBehavior] = useState("");
  const [consequence, setConsequence] = useState("");
  const [when, setWhen] = useState("");
  const [state, setState] = useState("form"); // form | saving | error
  const [errMsg, setErrMsg] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const pageWrap = { minHeight: "100vh", background: PKL, padding: 20, fontFamily: "'Pretendard', -apple-system, sans-serif" };

  if (!info) {
    return (
      <div style={{ ...pageWrap, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>😕</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>링크가 올바르지 않아요</div>
          <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.6 }}>링크가 손상되었거나 만료되었을 수 있어요. 보내주신 분께 새 링크를 요청해 주세요.</div>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (!writer.trim()) { setErrMsg("작성자 이름을 입력해 주세요."); return; }
    if (!behavior.trim()) { setErrMsg("행동(B) 내용을 입력해 주세요."); return; }
    setState("saving"); setErrMsg("");
    const res = await saveExternalSubmission(info.cid, {
      scaleId: "ABC", childName: info.cn, target: info.tg, writer: writer.trim(),
      record: {
        antecedent: antecedent.trim(),
        behavior: behavior.trim(),
        consequence: consequence.trim(),
        when: when.trim(),
      },
    });
    if (res) {
      setSavedCount((n) => n + 1);
      setAntecedent(""); setBehavior(""); setConsequence(""); setWhen("");
      setState("form");
    } else {
      setState("error"); setErrMsg("제출에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    }
  };

  const field = (label, val, setter, ph, rows = 2) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 6 }}>{label}</div>
      <textarea value={val} onChange={(e) => setter(e.target.value)} placeholder={ph} rows={rows}
        style={{ ...inputStyle, resize: "vertical", minHeight: rows * 22, fontFamily: "inherit" }} />
    </div>
  );

  return (
    <div style={pageWrap}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: "20px 18px", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: PKD }}>{info.cn} 아동 · ABC 관찰 기록</div>
          <div style={{ fontSize: 12.5, color: MUTE, marginTop: 4, lineHeight: 1.6 }}>
            문제 상황이 있을 때마다 <b>선행–행동–후속</b>을 기록해 주세요. 한 건 제출 후에도 이 창에서 계속 이어서 기록할 수 있어요.
          </div>
          {info.tg ? <div style={{ fontSize: 12, color: INK, marginTop: 8, padding: "6px 10px", background: PKL, borderRadius: 8 }}>관찰 대상 행동: <b>{info.tg}</b></div> : null}
        </div>

        {savedCount > 0 && (
          <div style={{ background: "#EAF5EC", border: "1px solid #7FB77E", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#3A2C30" }}>
            ✅ 지금까지 <b>{savedCount}건</b> 제출됐어요. 계속 기록하셔도 됩니다.
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 16, padding: "18px 16px" }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 6 }}>작성자 이름</div>
            <input value={writer} onChange={(e) => setWriter(e.target.value)} placeholder="예: 김담임" style={inputStyle} />
          </div>
          {field("① 언제 (시간·상황)", when, setWhen, "예: 2교시 수학시간, 오전 10시경", 1)}
          {field("② 선행사건 A (행동 직전에 무슨 일이?)", antecedent, setAntecedent, "예: 어려운 문제를 풀라고 하자")}
          {field("③ 행동 B (관찰된 행동)", behavior, setBehavior, "예: 소리를 지르며 책상에 엎드림")}
          {field("④ 후속결과 C (행동 직후 어떻게 됐나?)", consequence, setConsequence, "예: 교사가 다가와 달래고 문제를 미룸")}

          {errMsg ? <div style={{ color: "#D85A5A", fontSize: 12.5, marginBottom: 10 }}>{errMsg}</div> : null}

          <button onClick={submit} disabled={state === "saving"}
            style={{ ...btnPrimary, width: "100%", padding: "12px", fontSize: 14, opacity: state === "saving" ? 0.6 : 1 }}>
            {state === "saving" ? "제출 중..." : "이 기록 제출하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 외부 작성 페이지 (로그인 없이, 링크로 접속) ─────
function ExternalFillPage({ token }) {
  const info = React.useMemo(() => decodeFillToken(token), [token]);
  // ABC 링크는 별도 페이지로 분기 (훅 호출 전에 처리)
  if (info && info.sc === "ABC") return <AbcFillPage info={info} />;
  return <ScaleFillPage info={info} />;
}

// ── 척도(설문) 외부 작성 페이지 ─────
function ScaleFillPage({ info }) {
  const scale = info ? SCALES[info.sc] : null;
  // 이 케이스+척도 조합의 "이미 제출함" 표시 키 (기기별)
  const doneKey = info && info.cid ? `bip-scale-done::${info.cid}::${info.sc}` : null;
  const [answers, setAnswers] = useState(() => (scale ? scale.items.map(() => null) : []));
  const [preInfo, setPreInfo] = useState({}); // FAST 앞부분 응답 (해당 척도에 preInfo 있을 때만)
  const [writer, setWriter] = useState("");
  const [state, setState] = useState(() => {
    // 이 폰에서 이미 제출했으면 제출완료 화면으로 시작
    if (doneKey) {
      try { if (localStorage.getItem(doneKey)) return "done"; } catch (e) {}
    }
    return "form";
  }); // form | saving | done | error
  const [errMsg, setErrMsg] = useState("");
  const setPre = (k, v) => setPreInfo((prev) => ({ ...prev, [k]: v }));

  if (!info || !scale) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PKL, padding: 20, fontFamily: "'Pretendard', -apple-system, sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>😕</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>링크가 올바르지 않아요</div>
          <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.6 }}>링크가 손상되었거나 만료되었을 수 있어요. 보내주신 분께 새 링크를 요청해 주세요.</div>
        </div>
      </div>
    );
  }

  const opts = SCALE_OPTIONS[scale.scale];
  const answeredCount = answers.filter((a) => a != null).length;

  const submit = async () => {
    if (!writer.trim()) { setErrMsg("작성자 이름을 입력해 주세요."); return; }
    setState("saving"); setErrMsg("");
    const res = await saveExternalSubmission(info.cid, {
      scaleId: info.sc, childName: info.cn, target: info.tg,
      writer: writer.trim(), answers,
      preInfo: (scale.preInfo && scale.preInfo.length) ? preInfo : undefined,
    });
    if (res) {
      // 이 폰에 "제출 완료" 기록 (다시 열면 제출완료 화면으로 시작)
      try { if (doneKey) localStorage.setItem(doneKey, String(Date.now())); } catch (e) {}
      setState("done");
    }
    else { setState("error"); setErrMsg("제출에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."); }
  };

  if (state === "done") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PKL, padding: 20, fontFamily: "'Pretendard', -apple-system, sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>제출 완료</div>
          <div style={{ fontSize: 13.5, color: MUTE, lineHeight: 1.6 }}>{info.cn} 아동의 {scale.name} 설문이 제출되었어요.<br />창을 닫으셔도 됩니다. 감사합니다 🙏</div>
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => {
                try { if (doneKey) localStorage.removeItem(doneKey); } catch (e) {}
                setAnswers(scale ? scale.items.map(() => null) : []);
                setPreInfo({});
                setWriter("");
                setState("form");
                if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              style={{ background: "none", border: `1px solid ${PKD}`, color: PKD, borderRadius: 9, padding: "10px 20px", fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", fontWeight: 600 }}
            >
              다시 작성하기
            </button>
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 8 }}>다시 제출하면 새 답변으로 한 번 더 전달됩니다.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${PKL} 0%, #fff 100%)`, fontFamily: "'Pretendard', -apple-system, sans-serif", padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 22, marginBottom: 14, boxShadow: "0 4px 20px rgba(212,114,138,0.1)" }}>
          <div style={{ fontWeight: 800, fontSize: 19, color: PKD }}>{scale.name}</div>
          <div style={{ fontSize: 12.5, color: MUTE, marginTop: 3 }}>{scale.fullName}</div>
          <div style={{ marginTop: 12, padding: "12px 14px", background: PKL, borderRadius: 10, fontSize: 13, color: INK, lineHeight: 1.6 }}>
            <b>{info.cn}</b> 아동{info.tg ? <> · 목표행동: <b>{info.tg}</b></> : null}에 대해, 아래 문항을 읽고 평소 모습에 가장 가까운 것을 골라주세요.
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: MUTE, marginBottom: 5, fontWeight: 600 }}>작성자 이름 <span style={{ color: PKD }}>*</span></div>
            <input value={writer} onChange={(e) => setWriter(e.target.value)} placeholder="예: 홍길동 (담임교사 / 어머니)" style={inputStyle} />
          </div>
        </div>

        {scale.preInfo && scale.preInfo.length ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: PKD, margin: "4px 2px 10px" }}>문제행동 정보</div>
            <PreInfoFields fields={scale.preInfo} values={preInfo} onChange={setPre} />
            <div style={{ fontSize: 13.5, fontWeight: 800, color: PKD, margin: "18px 2px 10px" }}>기능 평가 문항</div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10 }}>
          {scale.items.map((item, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
              <div style={{ fontSize: 13.5, color: INK, lineHeight: 1.5, marginBottom: 10 }}>
                <span style={{ color: PKD, fontWeight: 700 }}>{i + 1}.</span> {item.q}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {opts.map((o) => {
                  const sel = answers[i] === o.v;
                  return (
                    <button key={o.v} onClick={() => setAnswers((prev) => { const n = [...prev]; n[i] = o.v; return n; })}
                      style={{ padding: "7px 12px", borderRadius: 9, fontSize: 12.5, cursor: "pointer", fontWeight: sel ? 700 : 400,
                        border: sel ? `1.5px solid ${PKD}` : "1.5px solid #eadfe2",
                        background: sel ? PKL : "#fff", color: sel ? PKD : INK }}>
                      {o.label}{o.hint ? <span style={{ fontSize: 10.5, color: MUTE, marginLeft: 3 }}>{o.hint}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {errMsg && <div style={{ color: PKD, fontSize: 12.5, marginTop: 12, textAlign: "center" }}>{errMsg}</div>}

        <div style={{ position: "sticky", bottom: 0, marginTop: 16, padding: "12px 0", background: "linear-gradient(0deg, #fff 70%, transparent)" }}>
          <div style={{ fontSize: 11.5, color: MUTE, textAlign: "center", marginBottom: 8 }}>{answeredCount} / {scale.items.length} 문항 응답</div>
          <button onClick={submit} disabled={state === "saving"} style={{ ...btnPrimary, width: "100%", opacity: state === "saving" ? 0.6 : 1 }}>
            {state === "saving" ? "제출 중..." : "제출하기"}
          </button>
          <div style={{ fontSize: 10.5, color: MUTE, textAlign: "center", marginTop: 10 }}>{COPYRIGHT}</div>
        </div>
      </div>
    </div>
  );
}

// ── 외부 작성 링크 생성 박스 ────────────────────
function ExternalLinkBox({ scale, c }) {
  const [copied, setCopied] = useState(false);
  // 케이스 정보를 토큰에 담아 실제 작동하는 링크 생성
  const token = encodeFillToken({ cid: c.id, cn: c.name, tg: c.target || "", sc: scale.id });
  const base = (typeof window !== "undefined" && window.location)
    ? `${window.location.origin}${window.location.pathname}`
    : "https://aba-geomdan.github.io/bip-maker/";
  const url = `${base}#/fill/${scale.id.toLowerCase()}/${token}`;

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ marginTop: 10, padding: "12px 14px", background: "#FFF9FA", border: `1px dashed ${PK}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, color: INK, lineHeight: 1.6, marginBottom: 8 }}>
        이 링크를 외부 교사·부모에게 보내면, 앱 설치 없이 <b>{scale.name}</b> 설문을 직접 작성하고 제출할 수 있어요. 제출 결과는 이 케이스에 들어옵니다.
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input readOnly value={url} style={{ ...inputStyle, fontSize: 11.5, color: MUTE }} onFocus={(e) => e.target.select()} />
        <button onClick={copy} style={{ ...btnPrimary, flexShrink: 0, padding: "8px 12px", fontSize: 12 }}>{copied ? "복사됨 ✓" : "복사"}</button>
      </div>
      <div style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
        📩 제출된 설문은 <b>평가 탭</b> 아래 <b>받은 설문</b>에서 확인하고 결과로 반영할 수 있어요.
      </div>
    </div>
  );
}

// ── ABC 외부 작성 링크 박스 (기록 탭용) ──────────
function AbcLinkBox({ c }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const token = encodeFillToken({ cid: c.id, cn: c.name, tg: c.target || "", sc: "ABC" });
  const base = (typeof window !== "undefined" && window.location)
    ? `${window.location.origin}${window.location.pathname}`
    : "https://aba-geomdan.github.io/bip-maker/";
  const url = `${base}#/fill/abc/${token}`;

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen((v) => !v)} style={{ ...btnGhost, width: "100%", justifyContent: "center", padding: "10px 12px", fontSize: 13 }}>
        {open ? "▲ 외부 작성 링크 닫기" : "🔗 외부 교사에게 ABC 기록 링크 보내기"}
      </button>
      {open && (
        <div style={{ marginTop: 10, padding: "12px 14px", background: "#FFF9FA", border: `1px dashed ${PK}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: INK, lineHeight: 1.6, marginBottom: 8 }}>
            이 링크를 외부 교사·부모에게 보내면, 앱 설치 없이 <b>{c.name}</b> 아동의 ABC(선행–행동–후속)를 직접 기록·제출할 수 있어요. <b>같은 링크를 계속 열어</b> 사건이 생길 때마다 한 건씩 제출하면 됩니다.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input readOnly value={url} style={{ ...inputStyle, fontSize: 11.5, color: MUTE }} onFocus={(e) => e.target.select()} />
            <button onClick={copy} style={{ ...btnPrimary, flexShrink: 0, padding: "8px 12px", fontSize: 12 }}>{copied ? "복사됨 ✓" : "복사"}</button>
          </div>
          <div style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
            📩 제출된 기록은 아래 <b>받은 ABC 기록</b>에서 확인하고 이 케이스에 반영할 수 있어요.
          </div>
        </div>
      )}
    </div>
  );
}

// ── 완료된 평가 결과 카드 ────────────────────────
function AssessmentResultCard({ a, onRemove }) {
  const [open, setOpen] = useState(false);
  const [preOpen, setPreOpen] = useState(false);
  const scale = SCALES[a.scaleId];
  const maxSum = Math.max(...a.results.map((r) => r.sum), 1);
  // preInfo 중 값이 채워진 항목만 (라벨-값 쌍)
  const preRows = (scale.preInfo && a.preInfo)
    ? scale.preInfo
        .map((f) => {
          const v = a.preInfo[f.key];
          const text = Array.isArray(v) ? v.join(", ") : v;
          return text && String(text).trim() ? { label: f.label, text: String(text) } : null;
        })
        .filter(Boolean)
    : [];

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

      {preRows.length > 0 && (
        <>
          <button onClick={() => setPreOpen((v) => !v)} style={{ marginTop: 10, fontSize: 12.5, color: PKD, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            {preOpen ? "▲ 문제행동 정보 접기" : "▼ 문제행동 정보 보기"}
          </button>
          {preOpen && (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {preRows.map((row, i) => (
                <div key={i} style={{ background: PKL, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 11, color: MUTE, marginBottom: 2 }}>{row.label}</div>
                  <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{row.text}</div>
                </div>
              ))}
            </div>
          )}
        </>
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
  const [preInfo, setPreInfo] = useState({}); // FAST 앞부분(해당 척도만)
  const [showResult, setShowResult] = useState(false);
  const [ocrState, setOcrState] = useState("idle"); // idle | loading | done | error
  const [ocrMsg, setOcrMsg] = useState("");
  const setPre = (k, v) => setPreInfo((prev) => ({ ...prev, [k]: v }));

  const answered = answers.filter((a) => a != null && a !== "").length;
  const allDone = answered === scale.items.length;

  const setAnswer = (i, v) => setAnswers((prev) => { const n = [...prev]; n[i] = v; return n; });

  const finish = () => setShowResult(true);

  const result = showResult ? scoreAssessment(scaleId, answers) : null;

  // 종이 설문 사진/PDF → AI가 읽어서 16문항 + 앞부분 정보를 한 번에 자동 채움
  const onPhoto = async (file) => {
    if (!file) return;
    const hasPre = !!(scale.preInfo && scale.preInfo.length);
    setOcrState("loading"); setOcrMsg("사진을 읽는 중이에요...");
    try {
      // 1) 16문항 응답 채우기
      const filled = await readAssessmentPhoto(scaleId, file);
      let qCnt = 0;
      setAnswers((prev) => {
        const n = [...prev];
        filled.forEach((v, i) => { if (v != null && i < n.length) { n[i] = v; qCnt++; } });
        return n;
      });

      // 2) 앞부분 서술 정보 채우기 (해당 척도만; 실패해도 문항 결과는 유지)
      let preCnt = 0;
      if (hasPre) {
        setOcrMsg("앞부분 정보도 읽는 중이에요...");
        try {
          const info = await readFastPrePhoto(file);
          const merged = {};
          Object.entries(info).forEach(([k, v]) => {
            if (v == null) return;
            if (Array.isArray(v)) { if (v.length) { merged[k] = v; preCnt++; } }
            else if (String(v).trim()) { merged[k] = v; preCnt++; }
          });
          if (preCnt > 0) setPreInfo((prev) => ({ ...(prev || {}), ...merged }));
        } catch (_) { /* 앞부분 실패는 무시하고 문항 결과만 살림 */ }
      }

      const preMsg = hasPre ? ` · 앞부분 정보 ${preCnt}개` : "";
      setOcrMsg(`✓ ${qCnt}개 문항${preMsg}을(를) 자동으로 채웠어요. 빈 곳이나 틀린 곳은 직접 확인·수정해 주세요.`);
      setOcrState("done");
    } catch (e) {
      setOcrMsg(e.message || "사진 인식에 실패했어요. 직접 입력해 주세요.");
      setOcrState("error");
    }
  };

  // FAST 앞부분(서술형 정보) 사진 → preInfo 자동 채움
  const onPrePhoto = async (file) => {
    if (!file) return;
    setOcrState("loading"); setOcrMsg("앞부분 정보 사진을 읽는 중이에요...");
    try {
      const info = await readFastPrePhoto(file);
      setPre((prev) => {
        const next = { ...(prev || {}) };
        let cnt = 0;
        Object.entries(info).forEach(([k, v]) => {
          if (v == null) return;
          if (Array.isArray(v)) { if (v.length) { next[k] = v; cnt++; } }
          else if (String(v).trim()) { next[k] = v; cnt++; }
        });
        setOcrMsg(`✓ 앞부분 정보 ${cnt}개 항목을 자동으로 채웠어요. 틀린 곳은 직접 확인·수정해 주세요.`);
        return next;
      });
      setOcrState("done");
    } catch (e) {
      setOcrMsg(e.message || "앞부분 사진 인식에 실패했어요. 직접 입력해 주세요.");
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
            preInfo: (scale.preInfo && scale.preInfo.length) ? preInfo : undefined,
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
            <div style={{ fontSize: 13, fontWeight: 700, color: PKD }}>종이 설문 사진·PDF로 자동입력</div>
            <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>외부에서 받은 종이 설문을 찍거나 PDF로 올리면 AI가 응답을 채워요. (PDF가 더 정확해요)</div>
          </div>
          <label style={{ ...btnPrimary, cursor: ocrState === "loading" ? "wait" : "pointer", opacity: ocrState === "loading" ? 0.6 : 1, display: "inline-block" }}>
            {ocrState === "loading" ? "읽는 중..." : "사진/PDF 올리기"}
            <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} disabled={ocrState === "loading"}
              onChange={(e) => onPhoto(e.target.files && e.target.files[0])} />
          </label>
        </div>
        {ocrMsg && (
          <div style={{ marginTop: 10, fontSize: 12, color: ocrState === "error" ? "#C04040" : ocrState === "done" ? "#2e8b57" : MUTE, lineHeight: 1.5 }}>
            {ocrMsg}
          </div>
        )}
      </div>

      {/* FAST 앞부분 정보 (해당 척도만) */}
      {scale.preInfo && scale.preInfo.length ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ margin: "4px 2px 10px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: PKD }}>문제행동 정보</div>
          </div>
          <PreInfoFields fields={scale.preInfo} values={preInfo} onChange={setPre} />
          <div style={{ fontSize: 13.5, fontWeight: 800, color: PKD, margin: "18px 2px 10px" }}>기능 평가 문항</div>
        </div>
      ) : null}

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
function BIPSection({ c, assessments, onUpdateCase }) {
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
        </div>
        {agg.ambiguous && (
          <div style={{ marginTop: 8, padding: "9px 12px", background: "#FFF6E9", border: "1px solid #F0D9A8", borderRadius: 8, fontSize: 12.5, color: "#8A6D3B", lineHeight: 1.6 }}>
            ⚠ <b>{agg.ambiguousFuncs.map((f) => UNIFIED_FUNC_NAME[f].split(" (")[0]).join(", ")}</b> 기능의 점수가 비슷하게 나왔습니다. 여러 기능이 함께 작용할 수 있으니, 원자료와 임상 관찰을 바탕으로 아래에서 중재 대상 기능을 직접 확인·선택해 주세요.
          </div>
        )}
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
      <BIPDocument bip={bip} c={c} onUpdateCase={onUpdateCase} />
    </div>
  );
}

// ── BIP 문서 렌더 ───────────────────────────────
function BIPDocument({ bip, c, agg, onUpdateCase }) {
  // 중재안 제공일: 환경(학교/센터)별로 따로 저장
  const provideKey = bip.setting === "school" ? "provideDateSchool" : "provideDateCenter";
  const [provideDate, setProvideDate] = useState(c[provideKey] || today());
  const changeProvideDate = (v) => {
    setProvideDate(v);
    onUpdateCase && onUpdateCase({ [provideKey]: v }); // 해당 환경 칸에 영구 저장
  };
  // 환경(학교↔센터) 전환 시 그 환경에 저장된 제공일로 다시 맞춤
  useEffect(() => {
    setProvideDate(c[provideKey] || today());
  }, [provideKey]);
  const [aiState, setAiState] = useState("idle"); // idle | loading | done | error
  const [aiBip, setAiBip] = useState(null); // { antecedent:[], replacement:[], consequence:[] } — 있으면 템플릿 대신 사용
  const [aiErr, setAiErr] = useState("");
  const [viewMode, setViewMode] = useState("expert"); // expert | parent
  const [parentAi, setParentAi] = useState(null); // AI가 변환한 부모님용 { why, prevent, teach, respond }
  const [parentAiState, setParentAiState] = useState("idle"); // idle | loading | error
  const [parentAiErr, setParentAiErr] = useState("");
  // 부모용 기준값(편집 시작점): AI변환 > 템플릿
  const parentBase = parentAi || PARENT_BIP[bip.func] || PARENT_BIP.sensory;
  // 부모용 편집본 (환경별, 기능 불일치 시 무시)
  const pEditKey = bip.setting === "school" ? "editedParent_school" : "editedParent_center";
  const savedParent = c[pEditKey] && c[pEditKey].func === bip.func ? c[pEditKey] : null;
  const [pEditing, setPEditing] = useState(false);
  const [pDraft, setPDraft] = useState(null);
  const [pErr, setPErr] = useState("");
  const pEmptyPhotos = { prevent: [], teach: [], respond: [] };
  // 표시용 부모 콘텐츠: 편집본 > AI/템플릿
  const parentContent = {
    why: savedParent?.why ?? parentBase.why,
    prevent: savedParent?.prevent ?? parentBase.prevent,
    teach: savedParent?.teach ?? parentBase.teach,
    respond: savedParent?.respond ?? parentBase.respond,
  };
  const parentPhotos = savedParent?.photos ?? pEmptyPhotos;
  // 시각카드: 편집본에 저장된 목록 우선, 없으면 기능별 기본
  const baseVisualCards = getVisualCards(bip.func);
  const showVisualCards = savedParent?.visualCards ?? baseVisualCards;

  const startPEdit = () => {
    setPDraft({
      why: parentContent.why,
      prevent: [...parentContent.prevent], teach: [...parentContent.teach], respond: [...parentContent.respond],
      photos: {
        prevent: [...(parentPhotos.prevent || [])],
        teach: [...(parentPhotos.teach || [])],
        respond: [...(parentPhotos.respond || [])],
      },
      visualCards: [...showVisualCards],
    });
    setPEditing(true);
  };
  const cancelPEdit = () => { setPEditing(false); setPDraft(null); setPErr(""); };
  const savePEdit = () => {
    const cleaned = {
      func: bip.func,
      why: pDraft.why.trim(),
      prevent: pDraft.prevent.map((s) => s.trim()).filter(Boolean),
      teach: pDraft.teach.map((s) => s.trim()).filter(Boolean),
      respond: pDraft.respond.map((s) => s.trim()).filter(Boolean),
      photos: pDraft.photos,
      visualCards: pDraft.visualCards,
    };
    const approx = JSON.stringify(cleaned).length;
    if (approx > 4_000_000) { setPErr("사진 용량이 너무 큽니다. 사진 수를 줄인 뒤 저장해 주세요."); return; }
    onUpdateCase && onUpdateCase({ [pEditKey]: cleaned });
    setPEditing(false); setPDraft(null);
  };
  const resetPEdit = () => { onUpdateCase && onUpdateCase({ [pEditKey]: null }); setPEditing(false); setPDraft(null); };
  const setPField = (k, v) => setPDraft((d) => ({ ...d, [k]: v }));
  const setPItem = (k, i, v) => setPDraft((d) => ({ ...d, [k]: d[k].map((x, j) => j === i ? v : x) }));
  const addPItem = (k) => setPDraft((d) => ({ ...d, [k]: [...d[k], ""] }));
  const removePItem = (k, i) => setPDraft((d) => ({ ...d, [k]: d[k].filter((_, j) => j !== i) }));
  const addPPhotos = async (section, fileList) => {
    setPErr("");
    try {
      const files = Array.from(fileList).slice(0, 6);
      const encoded = [];
      for (const f of files) encoded.push(await compressImage(f));
      setPDraft((d) => {
        const nextPhotos = { ...d.photos, [section]: [...d.photos[section], ...encoded] };
        if (JSON.stringify({ ...d, photos: nextPhotos }).length > 4_000_000) {
          setPErr("사진을 더 추가하면 저장 용량을 초과합니다."); return d;
        }
        return { ...d, photos: nextPhotos };
      });
    } catch (e) { setPErr("사진을 추가하지 못했습니다: " + e.message); }
  };
  const removePPhoto = (section, i) => setPDraft((d) => ({ ...d, photos: { ...d.photos, [section]: d.photos[section].filter((_, j) => j !== i) } }));
  const removePVisualCard = (i) => setPDraft((d) => ({ ...d, visualCards: d.visualCards.filter((_, j) => j !== i) }));
  const addPVisualCard = (card) => setPDraft((d) => ({ ...d, visualCards: [...d.visualCards, card] }));
  const setPCardSlotPhoto = (cardIdx, slotIdx, dataUrl) =>
    setPDraft((d) => ({
      ...d,
      visualCards: d.visualCards.map((c, ci) => {
        if (ci !== cardIdx) return c;
        const photos = [...(c.photos || [])];
        photos[slotIdx] = dataUrl;
        return { ...c, photos };
      }),
    }));
  // 환경/기능 바뀌면 부모 편집 폐기
  useEffect(() => { setPEditing(false); setPDraft(null); }, [pEditKey, bip.func]);

  const runParentAI = async () => {
    setParentAiState("loading"); setParentAiErr("");
    try {
      const r = await enhanceParentBIP(bip, c);
      setParentAi(r);
      setParentAiState("idle");
    } catch (e) {
      setParentAiErr(e.message || "AI 변환 중 문제가 발생했어요.");
      setParentAiState("error");
    }
  };
  const clearParentAI = () => { setParentAi(null); setParentAiState("idle"); setParentAiErr(""); };

  const usingAi = !!aiBip;

  // ── 사용자 편집 (가설·의미·3섹션) ──
  const editKey = bip.setting === "school" ? "editedBip_school" : "editedBip_center";
  // 기준값: AI 있으면 AI, 없으면 템플릿 (편집 시작점)
  const baseAnt = usingAi ? aiBip.antecedent : bip.antecedent;
  const baseRep = usingAi ? aiBip.replacement : bip.replacement;
  const baseCon = usingAi ? aiBip.consequence : bip.consequence;
  const baseHyp = bip.hypothesis;
  const baseMean = FUNC_MEANING(bip.func, c.name, c.target, bip.setting);

  const savedEdit = c[editKey] && c[editKey].func === bip.func ? c[editKey] : null; // 기능 바뀌면 편집본 무시
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null); // 편집 중 임시본

  // 표시용: 저장된 편집본 > AI/템플릿
  const showHyp = savedEdit?.hypothesis ?? baseHyp;
  const showMean = savedEdit?.meaning ?? baseMean;
  const showAnt = savedEdit?.antecedent ?? baseAnt;
  const showRep = savedEdit?.replacement ?? baseRep;
  const showCon = savedEdit?.consequence ?? baseCon;
  // 사진(섹션별 배열). 편집본에만 존재
  const emptyPhotos = { antecedent: [], replacement: [], consequence: [] };
  const showPhotos = savedEdit?.photos ?? emptyPhotos;
  // 시각카드: 편집본에 저장된 목록 우선, 없으면 기능별 기본
  const baseVisualCardsX = getVisualCards(bip.func);
  const showVisualCardsX = savedEdit?.visualCards ?? baseVisualCardsX;

  const startEdit = () => {
    setDraft({
      hypothesis: showHyp, meaning: showMean,
      antecedent: [...showAnt], replacement: [...showRep], consequence: [...showCon],
      photos: {
        antecedent: [...(showPhotos.antecedent || [])],
        replacement: [...(showPhotos.replacement || [])],
        consequence: [...(showPhotos.consequence || [])],
      },
      visualCards: [...showVisualCardsX],
    });
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setDraft(null); };
  const saveEdit = () => {
    const cleaned = {
      func: bip.func,
      hypothesis: draft.hypothesis.trim(),
      meaning: draft.meaning.trim(),
      antecedent: draft.antecedent.map((s) => s.trim()).filter(Boolean),
      replacement: draft.replacement.map((s) => s.trim()).filter(Boolean),
      consequence: draft.consequence.map((s) => s.trim()).filter(Boolean),
      photos: draft.photos,
      visualCards: draft.visualCards,
    };
    // 용량 방어: 저장될 편집본 대략 크기 확인 (사진 base64가 대부분)
    const approxBytes = JSON.stringify(cleaned).length; // UTF-16이지만 base64는 ASCII라 근사치로 충분
    if (approxBytes > 4_000_000) { // 4MB 초과 시 차단 (Supabase 5MB 한계 여유)
      setPhotoErr("사진 용량이 너무 큽니다. 사진 수를 줄인 뒤 다시 저장해 주세요. (현재 약 " + Math.round(approxBytes / 1024 / 1024 * 10) / 10 + "MB)");
      return;
    }
    onUpdateCase && onUpdateCase({ [editKey]: cleaned });
    setEditing(false); setDraft(null);
  };
  const resetEdit = () => {
    onUpdateCase && onUpdateCase({ [editKey]: null });
    setEditing(false); setDraft(null);
  };
  // 환경(센터↔학교) 또는 기능이 바뀌면 편집 중이던 draft를 폐기 (다른 환경에 잘못 저장 방지)
  useEffect(() => {
    setEditing(false); setDraft(null);
  }, [editKey, bip.func]);
  const setDraftField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setDraftItem = (k, i, v) => setDraft((d) => ({ ...d, [k]: d[k].map((x, j) => j === i ? v : x) }));
  const addDraftItem = (k) => setDraft((d) => ({ ...d, [k]: [...d[k], ""] }));
  const removeDraftItem = (k, i) => setDraft((d) => ({ ...d, [k]: d[k].filter((_, j) => j !== i) }));
  // 사진 핸들러
  const [photoErr, setPhotoErr] = useState("");
  const addDraftPhotos = async (section, fileList) => {
    setPhotoErr("");
    try {
      const files = Array.from(fileList).slice(0, 6);
      const encoded = [];
      for (const f of files) encoded.push(await compressImage(f));
      setDraft((d) => {
        const nextPhotos = { ...d.photos, [section]: [...d.photos[section], ...encoded] };
        // 누적 용량 확인 (사진 base64 합산). 한계 초과면 추가 취소하고 경고
        const approx = JSON.stringify({ ...d, photos: nextPhotos }).length;
        if (approx > 4_000_000) {
          setPhotoErr("사진을 더 추가하면 저장 용량을 초과합니다. 기존 사진을 줄이거나 크기가 작은 사진을 사용해 주세요.");
          return d; // 추가 취소
        }
        return { ...d, photos: nextPhotos };
      });
    } catch (e) {
      setPhotoErr("사진을 추가하지 못했습니다: " + e.message);
    }
  };
  const removeDraftPhoto = (section, i) =>
    setDraft((d) => ({ ...d, photos: { ...d.photos, [section]: d.photos[section].filter((_, j) => j !== i) } }));
  const removeDraftVisualCard = (i) =>
    setDraft((d) => ({ ...d, visualCards: d.visualCards.filter((_, j) => j !== i) }));
  const addDraftVisualCard = (card) =>
    setDraft((d) => ({ ...d, visualCards: [...d.visualCards, card] }));
  const setDraftCardSlotPhoto = (cardIdx, slotIdx, dataUrl) =>
    setDraft((d) => ({
      ...d,
      visualCards: d.visualCards.map((c, ci) => {
        if (ci !== cardIdx) return c;
        const photos = [...(c.photos || [])];
        photos[slotIdx] = dataUrl; // null이면 제거
        return { ...c, photos };
      }),
    }));

  const copyText = () => {
    if (viewMode === "parent") {
      const pc = parentContent;
      const nm = displayName(c.name);
      const lines = [
        `[ ${nm} 가정 지원 안내 ]`,
        "",
        `🤔 ${nm}는 왜 이런 행동을 할까요?`,
        pc.why,
        "",
        "🌱 미리 예방해요",
        ...pc.prevent.map((t, i) => `${i + 1}. ${t}`),
        "",
        "💬 다른 행동을 가르쳐요",
        ...pc.teach.map((t, i) => `${i + 1}. ${t}`),
        "",
        "🤗 이렇게 반응해주세요",
        ...pc.respond.map((t, i) => `${i + 1}. ${t}`),
        "",
        "검단ABA언어행동연구소",
      ];
      if (navigator.clipboard) navigator.clipboard.writeText(lines.join("\n"));
      return;
    }
    const b2 = { ...bip, hypothesis: showHyp, antecedent: showAnt, replacement: showRep, consequence: showCon, _meaning: showMean };
    const txt = bipToText(b2, c, agg);
    if (navigator.clipboard) navigator.clipboard.writeText(txt);
  };

  const buildHtml = () => {
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tierName = { primary: "1차 기능", secondary: "2차 기능", tertiary: "별도 기능" };
    const fn = (f) => (UNIFIED_FUNC_NAME[f] || f).split(" (")[0];
    const tiers = (agg && agg.tiers ? agg.tiers.filter((t) => t.tier !== "minor") : []);
    const li = (arr) => arr.map((t) => `<div class="item">${esc(t)}</div>`).join("");
    const photoHtml = (arr) => (!arr || !arr.length) ? "" :
      `<div class="photos">${arr.map((src) => `<img class="photo" src="${src}" />`).join("")}</div>`;
    const title = bip.setting === "school" ? "개별 행동중재계획서 (PBIP)" : "행동중재계획 (BIP)";
    const aiBadge = "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(c.name)}_BIP</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
@media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}}
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;color:#3A2C30;line-height:1.7;padding:40px;max-width:740px;margin:auto;}
.topbar{height:6px;background:linear-gradient(90deg,#D4728A,#F5A0B1);border-radius:3px;margin-bottom:18px;}
.brandrow{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
.brandrow img{height:68px;width:auto;object-fit:contain;}
.brandrow .bt{font-size:16px;font-weight:700;color:#C4557A;letter-spacing:.5px;}
.brandrow .bs{font-size:15px;font-weight:600;color:#8A5A66;line-height:1.5;}
.infobox{display:flex;flex-wrap:wrap;gap:0;border:1.5px solid #F3C9D5;border-radius:10px;overflow:hidden;margin-bottom:26px;}
.infobox .cell{display:flex;min-width:33.33%;flex:1;}
.infobox .ck{background:#FFF0F3;color:#C4557A;font-weight:700;font-size:12px;padding:10px 12px;min-width:56px;display:flex;align-items:center;}
.infobox .cv{padding:10px 12px;font-size:12.5px;display:flex;align-items:center;flex:1;background:#fff;}
h1{font-size:22px;font-weight:800;letter-spacing:-.5px;color:#3A2C30;margin:0 0 6px;}
.subline{font-size:11.5px;color:#B08A94;letter-spacing:.4px;margin-bottom:26px;padding-bottom:14px;border-bottom:1px solid #F3E3E8;}
.sec{margin-bottom:22px;}
.sec-break{break-before:page;page-break-before:always;}
.secH{display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,#FFF0F3,#FFF9FA 80%);border-left:4px solid #D4728A;border-radius:0 8px 8px 0;padding:9px 14px;margin-bottom:12px;break-inside:avoid;break-after:avoid;page-break-after:avoid;}
.secH .n{background:#D4728A;color:#fff;min-width:24px;height:24px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;}
.secH .t{font-size:14.5px;font-weight:800;color:#C4557A;}
.item{position:relative;padding:11px 14px 11px 30px;background:#FFFBFC;border:1px solid #F5E4EA;border-radius:9px;font-size:13px;line-height:1.65;margin-bottom:7px;break-inside:avoid;}
.photos{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 4px;}
.photo{width:150px;height:150px;object-fit:cover;border-radius:9px;border:1px solid #F5E4EA;break-inside:avoid;}
.item::before{content:"";position:absolute;left:13px;top:16px;width:7px;height:7px;border-radius:50%;background:#F5A0B1;}
.hyp{background:linear-gradient(135deg,#FFF0F3,#FFF6F8);border:1px solid #F3C9D5;border-radius:10px;padding:15px 17px;font-size:13.5px;line-height:1.7;margin:10px 0;}
.hyp b{color:#C4557A;}
.meta{font-size:13px;margin:6px 0;padding:0 2px;}
.meta b{color:#3A2C30;}
.tier{display:inline-block;background:#D4728A;color:#fff;font-size:11px;padding:2px 10px;border-radius:20px;margin-right:6px;font-weight:600;}
.foot{margin-top:34px;border-top:2px solid #F5A0B1;padding-top:12px;color:#B5A8AD;font-size:10.5px;text-align:center;letter-spacing:.3px;}
</style></head><body>
<div class="topbar"></div>
<div class="brandrow"><img src="${LOGO_PDF_B64}" alt="로고"/><div class="bs">개별화된 데이터 기반 중재 · 언어/행동 통합적 접근</div></div>
<h1>${title}${aiBadge}</h1>
<div class="infobox">
<div class="cell"><div class="ck">대상</div><div class="cv">${esc(c.name)}${(c.age || c.school) ? " (" + [c.age, c.school].filter(Boolean).join(", ") + ")" : ""}</div></div>
<div class="cell"><div class="ck">환경</div><div class="cv">${bip.setting === "school" ? "학교 (통합/특수 학급)" : "ABA 센터"}</div></div>
<div class="cell"><div class="ck">중재안 제공일</div><div class="cv">${esc(isoToKr(provideDate))}</div></div>
</div>

<div class="sec">
<div class="secH"><span class="n">1</span><span class="t">행동의 기능 및 가설</span></div>
<div class="meta"><b>표적행동</b> · ${esc(c.target)}</div>
<div class="meta">${tiers.map((t) => `<span class="tier">${tierName[t.tier]}</span>${fn(t.func)} — ${esc(FUNC_HYPOTHESIS_SHORT[t.func])}`).join("<br>")}</div>
<div class="hyp"><b>주 기능: ${esc(bip.funcName)}</b><br>${esc(showHyp)}</div>
<div class="meta"><b>행동의 의미</b><br>${esc(showMean)}</div>
</div>

<div class="sec">
<div class="secH"><span class="n">2</span><span class="t">선행중재 (예방 전략)</span></div>
${li(showAnt)}
${photoHtml(showPhotos.antecedent)}
</div>

<div class="sec">
<div class="secH"><span class="n">3</span><span class="t">대체행동중재 (교수 전략)</span></div>
${li(showRep)}
${photoHtml(showPhotos.replacement)}
</div>

<div class="sec">
<div class="secH"><span class="n">4</span><span class="t">후속결과중재 (반응 전략)</span></div>
${li(showCon)}
${photoHtml(showPhotos.consequence)}
</div>

${showVisualCardsX.length ? `<div class="sec sec-break">
<div class="secH"><span class="n">5</span><span class="t">시각지원 자료 (인쇄용)</span></div>
${showVisualCardsX.map((card) => visualCardToHtml(card, esc)).join("")}
</div>` : ""}

${""}
<div class="foot">© 검단ABA언어행동연구소 (민다혜). All rights reserved.</div>
</body></html>`;
  };

  const buildParentHtml = () => {
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const nm = displayName(c.name);
    const pc = parentContent;
    const pPhotoHtml = (arr) => (!arr || !arr.length) ? "" :
      `<div class="pphotos">${arr.map((src) => `<img class="pphoto" src="${src}" />`).join("")}</div>`;
    const listBlock = (emoji, title, items, accent, bg, photoArr) => `
<div class="pblock">
  <div class="ph">${emoji ? `<span class="pe">${emoji}</span>` : ""}<span class="pt" style="color:${accent}">${esc(title)}</span></div>
  ${items.map((t, i) => `<div class="pitem" style="background:${bg}"><span class="pn" style="color:${accent}">${i + 1}</span><span>${esc(t)}</span></div>`).join("")}
  ${pPhotoHtml(photoArr)}
</div>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(c.name)}_가정지원안내</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
@media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}}
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;color:#3A2C30;line-height:1.7;padding:40px;max-width:720px;margin:auto;}
.topbar{height:6px;background:linear-gradient(90deg,#D4728A,#F5A0B1);border-radius:3px;margin-bottom:18px;}
.brandrow{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
.brandrow img{height:68px;width:auto;object-fit:contain;}
.brandrow .bt{font-size:16px;font-weight:700;color:#C4557A;letter-spacing:.5px;}
.brandrow .bs{font-size:15px;font-weight:600;color:#8A5A66;line-height:1.5;}
h1{font-size:21px;font-weight:800;color:#3A2C30;margin:0 0 4px;}
.intro{font-size:12.5px;color:#9A7A82;background:#FFF9FA;border-radius:10px;padding:11px 14px;margin:14px 0 22px;line-height:1.7;}
.pblock{margin-bottom:20px;break-inside:avoid;}
.ph{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
.pe{font-size:20px;}
.pt{font-size:15.5px;font-weight:800;}
.pdesc{font-size:13.5px;line-height:1.85;border-radius:12px;padding:15px 17px;}
.pitem{display:flex;gap:11px;font-size:13.5px;line-height:1.75;border-radius:12px;padding:13px 15px;margin-bottom:8px;break-inside:avoid;}
.pn{flex-shrink:0;font-weight:800;}
.pphotos{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
.pphoto{width:150px;height:150px;object-fit:cover;border-radius:10px;border:1px solid #EADFE2;break-inside:avoid;}
.sec-break{break-before:page;page-break-before:always;height:0;}
.foot{margin-top:32px;border-top:2px solid #F5A0B1;padding-top:12px;color:#B5A8AD;font-size:10.5px;text-align:center;}
</style></head><body>
<div class="topbar"></div>
<div class="brandrow"><img src="${LOGO_PDF_B64}" alt="로고"/><div class="bs">개별화된 데이터 기반 중재 · 언어/행동 통합적 접근</div></div>
<h1>${esc(nm)} 가정 지원 안내</h1>
<div class="intro">이 안내는 <b>${esc(nm)} 부모님</b>을 위해 쉽게 풀어 쓴 가정 지원 자료입니다. 집에서 이렇게 도와주시면 ${esc(nm)}에게 큰 힘이 됩니다.</div>
<div class="pblock">
  <div class="ph"><span class="pt" style="color:#D4728A">${esc(nm)}는 왜 이런 행동을 할까요?</span></div>
  <div class="pdesc" style="background:#FFF0F3">${esc(pc.why)}</div>
</div>
${listBlock("", "미리 예방해요 (이렇게 해보세요)", pc.prevent, "#5C9A72", "#F0F7F1", parentPhotos.prevent)}
${listBlock("", "다른 행동을 가르쳐요", pc.teach, "#5B7BB5", "#EEF3FB", parentPhotos.teach)}
${listBlock("", "이렇게 반응해주세요", pc.respond, "#C99A4B", "#FFF6EC", parentPhotos.respond)}
${showVisualCards.length ? `<div class="sec-break"></div>
<div class="pblock"><div class="ph"><span class="pt" style="color:#D4728A">집에서 함께 쓰는 자료</span></div>
<div style="font-size:12px;color:#9A7A82;margin:-4px 0 12px;">아래 카드를 출력해서 아이와 함께 사용해 보세요.</div>
${showVisualCards.map((card) => visualCardToHtml(card, esc)).join("")}
</div>` : ""}
<div class="foot">© 검단ABA언어행동연구소 (민다혜). All rights reserved.</div>
</body></html>`;
  };

  const [printWarn, setPrintWarn] = useState(false);
  const doPrint = () => {
    setPrintWarn(false);
    const w = window.open("", "_blank");
    if (!w) { setPrintWarn(true); return; }
    w.document.write(viewMode === "parent" ? buildParentHtml() : buildHtml());
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const runAI = async () => {
    // 정보가 부실하면 AI가 일반론만 뱉으므로, 실행 전 안내한다.
    const filled = [
      (c.behaviorDetail || "").trim(),
      (c.likes || "").trim(),
      (c.comm || "").trim(),
      (c.triggers || "").trim(),
      (c.records && c.records.length) ? "rec" : "",
    ].filter(Boolean).length;
    if (filled <= 1) {
      const missing = [
        !(c.behaviorDetail || "").trim() && "행동의 구체적 모습",
        !(c.likes || "").trim() && "좋아하는 것(강화제)",
        !(c.comm || "").trim() && "의사소통 수준",
        !(c.triggers || "").trim() && "심해지는·진정되는 상황",
        !(c.records && c.records.length) && "ABC 관찰기록",
      ].filter(Boolean);
      const ok = window.confirm(
        "이 아이에 대한 정보가 거의 비어 있어요.\n" +
        "이대로 AI를 돌리면 어느 아이에게나 해당하는 '일반적인' 중재가 나옵니다.\n\n" +
        "채우면 훨씬 정확해지는 항목:\n· " + missing.join("\n· ") +
        "\n\n그래도 지금 바로 진행할까요?\n(취소를 누르고 케이스 정보를 채운 뒤 다시 실행하는 걸 권장해요)"
      );
      if (!ok) return;
    }
    setAiState("loading"); setAiErr("");
    try {
      const result = await enhanceBIPWithAI(bip, c);
      setAiBip(result);
      setAiState("done");
    } catch (e) {
      setAiErr(e.message || "AI 생성 중 문제가 발생했어요. 다시 시도해 주세요.");
      setAiState("error");
    }
  };

  const clearAI = () => { setAiBip(null); setAiState("idle"); setAiErr(""); };

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 2px 12px rgba(212,114,138,0.06)" }}>
      {/* 전문가용 ↔ 부모님용 토글 */}
      <div style={{ display: "flex", background: PKL, borderRadius: 10, padding: 4, marginBottom: 12 }}>
        <button onClick={() => setViewMode("expert")} style={{ flex: 1, padding: "8px 12px", fontSize: 13, fontWeight: 700, border: "none", borderRadius: 7, cursor: "pointer", background: viewMode === "expert" ? "#fff" : "transparent", color: viewMode === "expert" ? PKD : MUTE, boxShadow: viewMode === "expert" ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>👩‍⚕️ 전문가용</button>
        <button onClick={() => setViewMode("parent")} style={{ flex: 1, padding: "8px 12px", fontSize: 13, fontWeight: 700, border: "none", borderRadius: 7, cursor: "pointer", background: viewMode === "parent" ? "#fff" : "transparent", color: viewMode === "parent" ? PKD : MUTE, boxShadow: viewMode === "parent" ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>👨‍👩‍👧 부모님용</button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 4 }}>
        {viewMode === "expert" && !editing && (
          <button onClick={startEdit} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>✏️ 편집</button>
        )}
        {viewMode === "expert" && editing && (
          <>
            <button onClick={cancelEdit} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>취소</button>
            <button onClick={saveEdit} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}>✓ 저장</button>
          </>
        )}
        {!editing && <button onClick={copyText} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>📋 복사</button>}
        {!editing && <button onClick={doPrint} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}>📄 PDF 저장</button>}
      </div>
      {viewMode === "expert" && savedEdit && !editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFF9E9", border: "1px solid #F0DDA8", borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 12, color: "#8A6D3B" }}>
          ✏️ 직접 수정한 내용이 반영되어 있습니다.
          <button onClick={resetEdit} style={{ marginLeft: "auto", fontSize: 11, color: MUTE, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>원래대로</button>
        </div>
      )}
      {editing && photoErr && (
        <div style={{ background: "#FFF0F0", border: "1px solid #F0B0B0", borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 12, color: "#C04040" }}>{photoErr}</div>
      )}
      {printWarn && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FFF0F0", border: "1px solid #F0B0B0", borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 12.5, color: "#C04040", lineHeight: 1.6 }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>팝업이 차단되어 새 창을 열 수 없어요. 주소창 오른쪽의 팝업 차단 아이콘에서 <b>이 사이트 팝업 허용</b>을 선택한 뒤 다시 눌러 주세요.</span>
          <button onClick={() => setPrintWarn(false)} style={{ marginLeft: "auto", flexShrink: 0, background: "none", border: "none", color: "#C04040", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}
      {/* 대상 정보 표 */}
      <div style={{ border: `1px solid ${PKL}`, borderRadius: 10, overflow: "hidden", marginBottom: 12, marginTop: 6 }}>
        <InfoRow label="대상" value={`${c.name}${(c.age||c.school)? " ("+[c.age,c.school].filter(Boolean).join(", ")+")":""}`} />
        <InfoRow label="환경" value={bip.setting === "school" ? "학교 (통합/특수 학급)" : "ABA 센터"} />
        <InfoRow label="제공일" last value={
          <input type="date" value={provideDate}
            onChange={(e) => changeProvideDate(e.target.value)}
            style={{ border: `1px solid ${PKL}`, borderRadius: 7, padding: "4px 8px", fontSize: 12.5, color: INK, fontFamily: "inherit", background: "#fff" }}
            onFocus={(e) => (e.target.style.borderColor = PK)}
            onBlur={(e) => (e.target.style.borderColor = PKL)}
          />
        } />
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: bip.setting === "school" ? "#5B7BB5" : PKD, background: bip.setting === "school" ? "#EEF3FB" : PKL, padding: "5px 11px", borderRadius: 20, marginBottom: 16 }}>
        {bip.setting === "school" ? "🏫 학교(PBS) 맞춤 — 개별교수 제약 반영" : "🏛 센터(ABA) 맞춤"}
      </div>

      {viewMode === "parent" ? (
        <>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
          {!pEditing && <button onClick={startPEdit} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>✏️ 편집</button>}
          {pEditing && <button onClick={cancelPEdit} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>취소</button>}
          {pEditing && <button onClick={savePEdit} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 12 }}>✓ 저장</button>}
        </div>
        {savedParent && !pEditing && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFF9E9", border: "1px solid #F0DDA8", borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 12, color: "#8A6D3B" }}>
            ✏️ 직접 수정한 내용이 반영되어 있습니다.
            <button onClick={resetPEdit} style={{ marginLeft: "auto", fontSize: 11, color: MUTE, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>원래대로</button>
          </div>
        )}
        {pEditing && pErr && (
          <div style={{ background: "#FFF0F0", border: "1px solid #F0B0B0", borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 12, color: "#C04040" }}>{pErr}</div>
        )}
        <ParentView content={parentContent} childName={c.name}
          visualCards={showVisualCards} draftVisualCards={pDraft?.visualCards} onRemoveCard={removePVisualCard} onAddCard={addPVisualCard} onSlotPhoto={setPCardSlotPhoto}
          editing={pEditing} draft={pDraft} photos={parentPhotos}
          onField={setPField} onItem={setPItem} onAddItem={addPItem} onRemoveItem={removePItem}
          onAddPhotos={addPPhotos} onRemovePhoto={removePPhoto} />
        <div style={{ marginTop: 16, borderTop: `1px dashed ${PKL}`, paddingTop: 16 }}>
          {!parentAi && (
            <>
              <button onClick={runParentAI} disabled={parentAiState === "loading"} style={{ ...btnPrimary, width: "100%", opacity: parentAiState === "loading" ? 0.6 : 1 }}>
                {parentAiState === "loading" ? "✨ AI가 이 아이 맞게 쓰는 중..." : "✨ AI로 우리 아이 맞춤 안내 만들기"}
              </button>
              <div style={{ fontSize: 11, color: MUTE, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
                위 기본 안내는 즉시 제공돼요. AI 맞춤은 눌렀을 때만, 이 아이의 기록·정보를 반영해 더 자연스럽게 써줍니다.
              </div>
            </>
          )}
          {parentAiState === "error" && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "#FFF0F0", border: "1px solid #F0B0B0", borderRadius: 10, fontSize: 12.5, color: "#C04040" }}>{parentAiErr}</div>
          )}
          {parentAi && (
            <div style={{ padding: "12px 14px", background: "#F5F0FA", border: "1px solid #D9C9F0", borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 15 }}>✨</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#6B5B8A" }}>AI 맞춤 안내 표시 중</span>
                <button onClick={runParentAI} disabled={parentAiState === "loading"} style={{ marginLeft: "auto", fontSize: 11, color: "#8A6FB0", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>{parentAiState === "loading" ? "쓰는 중..." : "↻ 다시"}</button>
                <button onClick={clearParentAI} style={{ fontSize: 11, color: MUTE, background: "none", border: "none", cursor: "pointer" }}>기본으로</button>
              </div>
            </div>
          )}
        </div>
        </>
      ) : (
      <>
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
          {editing
            ? <div style={{ marginTop: 6 }}><EditableText value={draft.hypothesis} onChange={(v) => setDraftField("hypothesis", v)} /></div>
            : showHyp}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 }}>행동의 의미</div>
          {editing
            ? <EditableText value={draft.meaning} onChange={(v) => setDraftField("meaning", v)} />
            : <div style={{ fontSize: 13, lineHeight: 1.7, color: INK }}>{showMean}</div>}
        </div>
      </BIPBlock>

      <BIPBlock num="2" title="선행중재 (예방 전략)">
        {editing
          ? <EditableList items={draft.antecedent} onChange={(i, v) => setDraftItem("antecedent", i, v)} onAdd={() => addDraftItem("antecedent")} onRemove={(i) => removeDraftItem("antecedent", i)} />
          : <BulletList items={showAnt} />}
        {editing
          ? <PhotoEditor photos={draft.photos.antecedent} onAdd={(fl) => addDraftPhotos("antecedent", fl)} onRemove={(i) => removeDraftPhoto("antecedent", i)} />
          : <PhotoStrip photos={showPhotos.antecedent} />}
      </BIPBlock>

      <BIPBlock num="3" title="대체행동중재 (교수 전략)">
        {editing
          ? <EditableList items={draft.replacement} onChange={(i, v) => setDraftItem("replacement", i, v)} onAdd={() => addDraftItem("replacement")} onRemove={(i) => removeDraftItem("replacement", i)} />
          : <BulletList items={showRep} />}
        {editing
          ? <PhotoEditor photos={draft.photos.replacement} onAdd={(fl) => addDraftPhotos("replacement", fl)} onRemove={(i) => removeDraftPhoto("replacement", i)} />
          : <PhotoStrip photos={showPhotos.replacement} />}
      </BIPBlock>

      <BIPBlock num="4" title="후속결과중재 (반응 전략)">
        {editing
          ? <EditableList items={draft.consequence} onChange={(i, v) => setDraftItem("consequence", i, v)} onAdd={() => addDraftItem("consequence")} onRemove={(i) => removeDraftItem("consequence", i)} />
          : <BulletList items={showCon} />}
        {editing
          ? <PhotoEditor photos={draft.photos.consequence} onAdd={(fl) => addDraftPhotos("consequence", fl)} onRemove={(i) => removeDraftPhoto("consequence", i)} />
          : <PhotoStrip photos={showPhotos.consequence} />}
      </BIPBlock>

      <BIPBlock num="5" title="시각지원 자료 (인쇄용)">
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 12, lineHeight: 1.6 }}>
          {editing
            ? "필요없는 카드는 × 버튼으로 뺄 수 있어요."
            : "이 기능에 맞춰 자동 생성된 시각카드예요. 화면 그대로 인쇄해 교실·가정에서 사용할 수 있어요."}
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {editing
            ? (draft.visualCards || []).map((card, i) => (
                <EditableVisualCard key={i} card={card} cardIndex={i} onRemove={removeDraftVisualCard} onSlotPhoto={setDraftCardSlotPhoto} />
              ))
            : showVisualCardsX.map((card, i) => <VisualCard key={i} card={card} />)}
        </div>
        {editing && <CardPicker onAdd={addDraftVisualCard} />}
      </BIPBlock>

      {/* AI 맞춤 생성 */}
      <div style={{ marginTop: 18, borderTop: `1px dashed ${PKL}`, paddingTop: 16 }}>
        {!usingAi && (
          <>
            <button onClick={runAI} disabled={aiState === "loading"} style={{ ...btnPrimary, width: "100%", opacity: aiState === "loading" ? 0.6 : 1 }}>
              {aiState === "loading" ? "✨ AI가 이 아동에 맞게 작성 중..." : "✨ AI로 이 아동 맞춤 BIP 생성하기"}
            </button>
            <div style={{ fontSize: 11, color: MUTE, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
              위 기본 중재안은 크레딧 없이 즉시 생성돼요. AI 맞춤 생성은 눌렀을 때만, 케이스의 ABC 기록·평가 정보를 반영해 중재안을 새로 작성합니다.
            </div>
          </>
        )}

        {aiState === "error" && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#FFF0F0", border: "1px solid #F0B0B0", borderRadius: 10, fontSize: 12.5, color: "#C04040" }}>
            {aiErr}
          </div>
        )}

        {usingAi && (
          <div style={{ padding: "12px 14px", background: "#F5F0FA", border: "1px solid #D9C9F0", borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15 }}>✨</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#6B5B8A" }}>AI 맞춤 생성본 표시 중</span>
              <button onClick={runAI} disabled={aiState === "loading"} style={{ marginLeft: "auto", fontSize: 11, color: "#8A6FB0", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                {aiState === "loading" ? "생성 중..." : "↻ 다시 생성"}
              </button>
              <button onClick={clearAI} style={{ fontSize: 11, color: MUTE, background: "none", border: "none", cursor: "pointer" }}>기본으로</button>
            </div>
            <div style={{ fontSize: 11, color: "#8A6FB0", marginTop: 8, lineHeight: 1.6 }}>
              2~4번 중재안이 이 아동 정보(ABC 기록·평가)를 반영한 AI 생성본으로 바뀌었어요. <b>전문가 검토 후 사용</b>하세요. PDF·복사에도 이 내용이 반영됩니다.
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

// ── Claude API 호출: 이 아동 맞춤 BIP 전체 재작성 ───
async function enhanceBIPWithAI(bip, c, onDelta) {
  const isPbs = c.type === "pbs";

  // [3단계] 프롬프트 조립을 서버(bip-ai)로 이관. 여기선 재료(child·bip·isPbs)만 보낸다.
  const SUPABASE_FN_URL = "https://vdubgrxwijydwfabwpnk.supabase.co/functions/v1/bip-ai";
  const res = await fetch(SUPABASE_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ type: "bip", child: c, bip, isPbs, model: "claude-sonnet-5", max_tokens: 2500, stream: false }), // sonnet-5: 지침 준수·글 품질이 중요한 BIP 생성용(haiku보다 개별화·정확도 높음). stream:false로 JSON 한번에.
  });
  if (!res.ok) {
    let msg = "AI 서버 응답 오류";
    try { const e = await res.json(); if (e.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }

  // SSE(text/event-stream) 스트림을 읽어 텍스트 델타를 이어붙인다.
  // (스트림이 아니라 그냥 JSON이 오는 경우 — 하위호환 — 도 처리)
  const ctype = res.headers.get("content-type") || "";
  let text = "";
  if (ctype.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamErr = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const evt = JSON.parse(jsonStr);
          if (evt.type === "delta" && evt.text) {
            text += evt.text;
            if (typeof onDelta === "function") { try { onDelta(text); } catch (_) {} }
          } else if (evt.type === "error") {
            streamErr = evt.error || "AI 스트림 오류";
          }
        } catch (_) { /* 파싱 실패 라인 무시 */ }
      }
    }
    if (streamErr && !text) throw new Error(streamErr);
  } else {
    const data = await res.json();
    text = Array.isArray(data.content)
      ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
      : (data.text || "");
  }

  // JSON 파싱 → 실패 시 잘린 응답도 최대한 복구
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  const arr = (v) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

  let result = null;
  // 1차: 정상 JSON 파싱 시도
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      result = { antecedent: arr(parsed.antecedent), replacement: arr(parsed.replacement), consequence: arr(parsed.consequence) };
    }
  } catch (_) { result = null; }

  // 2차: 정상 파싱 실패(응답 잘림 등) → 각 배열을 정규식으로 부분 추출
  if (!result || (!result.antecedent.length && !result.replacement.length && !result.consequence.length)) {
    const pick = (key) => {
      const m = cleaned.match(new RegExp('"' + key + '"\\s*:\\s*\\[([\\s\\S]*?)(\\]|$)'));
      if (!m) return [];
      // "문자열" 항목들만 추출 (마지막 미완성 토막은 제외)
      const items = m[1].match(/"((?:[^"\\]|\\.)*)"/g) || [];
      return items.map((s) => { try { return JSON.parse(s); } catch { return s.replace(/^"|"$/g, ""); } }).map((x) => String(x).trim()).filter(Boolean);
    };
    result = { antecedent: pick("antecedent"), replacement: pick("replacement"), consequence: pick("consequence") };
  }

  if (!result.antecedent.length && !result.replacement.length && !result.consequence.length) {
    throw new Error("AI가 내용을 생성하지 못했어요. 다시 시도해 주세요.");
  }
  return result;
}

// ── 부모님용 쉬운 안내를 AI가 이 아이 맞춤으로 재작성 ───
async function enhanceParentBIP(bip, c) {
  // [3단계] 프롬프트 조립을 서버(bip-ai)로 이관. 재료(child·bip)만 보낸다.
  const SUPABASE_FN_URL = "https://vdubgrxwijydwfabwpnk.supabase.co/functions/v1/bip-ai";
  const res = await fetch(SUPABASE_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ type: "parent", child: c, bip, model: "claude-sonnet-5", max_tokens: 2500, stream: false }),
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
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  const arr = (v) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

  let out = null;
  try {
    const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
    if (s !== -1 && e !== -1 && e > s) {
      const p = JSON.parse(cleaned.slice(s, e + 1));
      out = { why: String(p.why || "").trim(), prevent: arr(p.prevent), teach: arr(p.teach), respond: arr(p.respond) };
    }
  } catch (_) { out = null; }

  // 잘린 응답 복구
  if (!out || (!out.why && !out.prevent.length && !out.teach.length && !out.respond.length)) {
    const pickStr = (k) => { const m = cleaned.match(new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); return m ? m[1].replace(/\\"/g, '"') : ""; };
    const pickArr = (k) => {
      const m = cleaned.match(new RegExp('"' + k + '"\\s*:\\s*\\[([\\s\\S]*?)(\\]|$)'));
      if (!m) return [];
      return (m[1].match(/"((?:[^"\\]|\\.)*)"/g) || []).map((s) => { try { return JSON.parse(s); } catch { return s.replace(/^"|"$/g, ""); } }).map((x) => String(x).trim()).filter(Boolean);
    };
    out = { why: pickStr("why"), prevent: pickArr("prevent"), teach: pickArr("teach"), respond: pickArr("respond") };
  }

  if (!out.why && !out.prevent.length && !out.teach.length && !out.respond.length) {
    throw new Error("AI가 내용을 생성하지 못했어요. 다시 시도해 주세요.");
  }
  // 빈 항목은 기존 템플릿으로 보완
  const base = PARENT_BIP[bip.func] || PARENT_BIP.sensory;
  return {
    why: out.why || base.why,
    prevent: out.prevent.length ? out.prevent : base.prevent,
    teach: out.teach.length ? out.teach : base.teach,
    respond: out.respond.length ? out.respond : base.respond,
  };
}

// ── 종이 설문 사진 인식 (Claude 비전) ───────────
// 이미지 + 문항목록 → 각 문항 응답값 배열(JSON)
async function readAssessmentPhoto(scaleId, file) {
  const scale = SCALES[scaleId];
  const opts = SCALE_OPTIONS[scale.scale];
  const validSet = new Set(opts.map((o) => o.v));

  // 파일 → OCR용 이미지로 정규화. PDF는 전 페이지를 한 장으로 렌더, 사진/캡처는 해상도를 키워 선명하게.
  const mediaType = file.type || "image/jpeg";
  const isPdf = mediaType === "application/pdf" || /\.pdf$/i.test(file.name || "");
  const fullJpeg = isPdf ? await pdfToStackedJpeg(file) : await imageToOcrJpeg(file);

  const SUPABASE_FN_URL = "https://vdubgrxwijydwfabwpnk.supabase.co/functions/v1/bip-ai";

  // 한 조각(이미지 + 문항범위)을 판독해 {번호: 값} 부분결과를 돌려주는 내부 함수
  const readChunk = async (jpegB64, itemRange) => {
    const res = await fetch(SUPABASE_FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ type: "ocr-scale", scaleId, itemRange, image: { media_type: "image/jpeg", data: jpegB64 }, model: "claude-sonnet-5", max_tokens: 1500, stream: false }),
    });
    if (!res.ok) {
      let msg = "사진 인식 서버 오류";
      try { const e = await res.json(); if (e.error) msg = e.error; } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    const raw = Array.isArray(data.content)
      ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
      : (data.text || "");
    const cleaned = String(raw).replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("["), end = cleaned.lastIndexOf("]");
    return JSON.parse(cleaned.slice(start, end + 1)); // [{n,v},...]
  };

  const answers = scale.items.map(() => null);
  const applyRows = (rows) => {
    rows.forEach((row) => {
      const idx = (Number(row.n) || 0) - 1;
      const v = row.v;
      if (idx >= 0 && idx < answers.length && v != null && validSet.has(String(v))) {
        answers[idx] = String(v);
      }
    });
  };

  // MAS(0~6점, 7칸)는 한 장으로 보내면 문항-점수 줄이 밀려 오독되므로,
  // 이미지를 위/아래로 나눠 각 절반을 해당 문항 범위만 판독한 뒤 합친다.
  const useSplit = scale.scale === "s0to6" && scale.items.length >= 12;
  try {
    if (useSplit) {
      const n = scale.items.length;
      const half = Math.ceil(n / 2);
      const [topImg, botImg] = await splitJpegVertically(fullJpeg, 2, 0.08);
      const [topRows, botRows] = await Promise.all([
        readChunk(topImg, [1, half]),
        readChunk(botImg, [half + 1, n]),
      ]);
      applyRows(topRows);
      applyRows(botRows);
    } else {
      applyRows(await readChunk(fullJpeg, null));
    }
  } catch (e) {
    throw new Error("사진에서 응답을 해석하지 못했어요. 더 선명한 사진으로 다시 시도하거나 직접 입력해 주세요.");
  }
  return answers;
}

// ── FAST 앞부분(서술형 정보) 사진/PDF 인식 → preInfo 객체 자동 채움 ──
// 사진/캡처 이미지 → OCR 판독용으로 해상도 정규화한 JPEG base64(순수 데이터)로 반환.
// 화면 캡처나 작게 찍은 사진은 글자·동그라미가 작아 AI가 헷갈리므로, 가로를 넉넉히 키운다.
// (PDF 렌더처럼 선명하게 만들어 판독 정확도를 높이는 목적. 대비/샤프닝은 건드리지 않아 필기 손상 없음.)
// base64 JPEG(순수 데이터)를 세로로 n등분해 각 조각의 base64 배열로 반환.
// 조각 경계에서 문항이 잘리지 않도록 위아래로 overlapRatio만큼 겹쳐서 자른다.
async function splitJpegVertically(base64, n = 2, overlapRatio = 0.06) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("이미지를 나누지 못했어요."));
    im.src = "data:image/jpeg;base64," + base64;
  });
  const W = img.width, H = img.height;
  const seg = H / n;
  const overlap = seg * overlapRatio;
  const out = [];
  for (let i = 0; i < n; i++) {
    const top = Math.max(0, Math.floor(i * seg - (i > 0 ? overlap : 0)));
    const bottom = Math.min(H, Math.ceil((i + 1) * seg + (i < n - 1 ? overlap : 0)));
    const h = bottom - top;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, h);
    ctx.drawImage(img, 0, top, W, h, 0, 0, W, h);
    out.push(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
  }
  return out;
}

async function imageToOcrJpeg(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("파일을 불러오지 못했어요."));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
    im.src = dataUrl;
  });
  // 가로 목표 2200px. 원본이 이미 크면 그대로(최대 2200), 작으면 키운다.
  const TARGET_W = 2200, MAX_H = 8000;
  let scale = TARGET_W / img.width;
  // 세로가 너무 길어지면(문항표 등) 높이 상한에 맞춰 축소
  if (img.height * scale > MAX_H) scale = MAX_H / img.height;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.92);
  return out.split(",")[1];
}

// PDF → 첫 페이지 JPEG 변환용 (pdf.js를 CDN에서 1회 로드)
let _pdfjsPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch (e) {}
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("PDF 처리 모듈을 불러오지 못했습니다."));
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}
// PDF 파일 → 모든 페이지를 세로로 이어붙인 한 장의 JPEG base64(순수 데이터)로 반환
async function pdfToStackedJpeg(file) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const n = pdf.numPages;

  // 1) 각 페이지를 개별 캔버스로 렌더
  const pages = [];
  let maxW = 0;
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const baseVp = page.getViewport({ scale: 1 });
    const scale = Math.min(5, Math.max(2.2, 2600 / baseVp.width));
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    const cx = c.getContext("2d");
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: cx, viewport: vp }).promise;
    pages.push(c);
    if (c.width > maxW) maxW = c.width;
  }

  // 2) 세로로 합치기 (Anthropic 이미지 제한: 어느 변도 8000px 초과 불가 → 7800px로 제한)
  const GAP = 12, MAX_H = 7800;
  let totalH = pages.reduce((s, c) => s + c.height, 0) + GAP * (pages.length - 1);
  let ratio = 1;
  if (totalH > MAX_H) ratio = MAX_H / totalH;

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.floor(maxW * ratio));
  out.height = Math.max(1, Math.floor(totalH * ratio));
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff"; octx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const c of pages) {
    const w = c.width * ratio, h = c.height * ratio;
    octx.drawImage(c, 0, y, w, h);
    y += h + GAP * ratio;
  }
  const dataUrl = out.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1];
}

async function readFastPrePhoto(file) {
  const mediaType = file.type || "image/jpeg";
  const isPdf = mediaType === "application/pdf" || /\.pdf$/i.test(file.name || "");
  // PDF는 native 문서 블록 대신 이미지로 변환해 보낸다(요청 크기·처리속도 안정).
  let payload;
  if (isPdf) {
    const jpegB64 = await pdfToStackedJpeg(file);
    payload = { image: { media_type: "image/jpeg", data: jpegB64 } };
  } else {
    // 사진/캡처는 OCR용으로 해상도를 키워 선명하게 보낸다(판독 정확도 향상).
    const jpegB64 = await imageToOcrJpeg(file);
    payload = { image: { media_type: "image/jpeg", data: jpegB64 } };
  }

  const SUPABASE_FN_URL = "https://vdubgrxwijydwfabwpnk.supabase.co/functions/v1/bip-ai";
  const res = await fetch(SUPABASE_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ type: "ocr-fastpre", ...payload, model: "claude-sonnet-5", max_tokens: 1500, stream: false }),
  });
  if (!res.ok) {
    let msg = "파일 인식 서버 오류";
    try { const e = await res.json(); if (e.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  let text = "";
  if (Array.isArray(data.content)) text = data.content.map((b) => b.text || "").join("");
  else if (typeof data.content === "string") text = data.content;
  text = text.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  let obj;
  try { obj = JSON.parse(text); } catch (_) { throw new Error("사진에서 정보를 읽지 못했어요. 직접 입력해 주세요."); }
  return obj && typeof obj === "object" ? obj : {};
}

// ── ABC 관찰기록 사진 인식 → {when, antecedent, behavior, consequence} ──
async function readAbcPhoto(file) {
  const base64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("사진을 불러오지 못했어요."));
    r.readAsDataURL(file);
  });
  const mediaType = file.type || "image/jpeg";

  // [3단계] ABC 판독 프롬프트 조립을 서버(bip-ai)로 이관. 이미지만 보낸다.
  const SUPABASE_FN_URL = "https://vdubgrxwijydwfabwpnk.supabase.co/functions/v1/bip-ai";
  const res = await fetch(SUPABASE_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ type: "ocr-abc", ...((file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")) ? { file: { media_type: "application/pdf", data: base64 } } : { image: { media_type: mediaType, data: base64 } }), model: "claude-sonnet-5", max_tokens: 1200, stream: false }),
  });
  if (!res.ok) {
    let msg = "사진 인식 서버 오류";
    try { const e = await res.json(); if (e.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const raw = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
    : (data.text || "");

  const cleaned = String(raw).replace(/```json|```/g, "").trim();
  let parsed;
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    throw new Error("사진에서 내용을 해석하지 못했어요. 더 선명한 사진으로 다시 시도하거나 직접 입력해 주세요.");
  }
  return {
    when: String(parsed.when || "").trim(),
    antecedent: String(parsed.antecedent || "").trim(),
    behavior: String(parsed.behavior || "").trim(),
    consequence: String(parsed.consequence || "").trim(),
  };
}

// ── PDF 내보내기용 시각카드 아이콘 SVG 문자열 (화면 CardIcon과 동일) ──
function cardIconSvg(name) {
  // 이모지로 표현 (표정·사람·사물)
  const emojiMap = {
    help: "🙋", rest: "😌", look: "👀", together: "🤝", me: "🙋",
    wait: "⏳", give: "🤲", want: "❤️", corner: "🏠", happy: "😊", sad: "😢",
  };
  if (emojiMap[name]) {
    return `<span style="font-size:30px;line-height:1;">${emojiMap[name]}</span>`;
  }
  // SVG 유지 (yes/stop/fidget)
  const P = {
    yes: '<circle cx="24" cy="24" r="16" fill="#DCF0E1" stroke="#5C9A72" stroke-width="2.4"/><path d="M16 24l5 5 11-11" fill="none" stroke="#5C9A72" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    stop: '<path d="M17 5h14l12 12v14L31 43H17L5 31V17z" fill="#E84D7F"/><ellipse cx="18" cy="13" rx="5" ry="2.6" fill="#fff" opacity="0.28"/><path d="M18 18l12 12M30 18L18 30" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>',
    fidget: '<circle cx="24" cy="24" r="13" fill="#D9C9F0" stroke="#8A6FB0" stroke-width="2"/><g fill="#B79AE0"><circle cx="24" cy="9" r="3.5"/><circle cx="24" cy="39" r="3.5"/><circle cx="9" cy="24" r="3.5"/><circle cx="39" cy="24" r="3.5"/><circle cx="13" cy="13" r="3"/><circle cx="35" cy="13" r="3"/><circle cx="13" cy="35" r="3"/><circle cx="35" cy="35" r="3"/></g><circle cx="24" cy="24" r="5" fill="#fff" opacity="0.6"/>',
  };
  const body = P[name] || P.yes;
  return `<svg width="30" height="30" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

// 시각카드 1장 → 워드용 HTML 문자열
function visualCardToHtml(card, esc) {
  // 헤더 바 있는 프레임 (화면 CardFrame과 통일)
  const frame = (inner, accent = "#D4728A", bodyBg = "#FFF0F3") =>
    `<div style="border:2px solid ${accent}33;border-radius:16px;overflow:hidden;margin:10px 0;break-inside:avoid;">
      <div style="background:${accent};color:#fff;font-size:13px;font-weight:800;padding:8px 14px;">${esc(card.title)}</div>
      <div style="padding:12px;background:${bodyBg};">${inner}</div></div>`;

  if (card.type === "sequence") {
    const cols = ["#5B8BB5", "#7BB07B", "#C99A4B", "#9B7BB5"];
    const cells = card.steps.map((st, i) => {
      const c = cols[i % cols.length];
      const label = typeof st === "string" ? st : st.label;
      const emoji = typeof st === "string" ? "" : (st.emoji || "");
      const emojiHtml = emoji ? `<div style="font-size:24px;line-height:1;margin-bottom:4px;">${emoji}</div>` : "";
      return `<td style="border:2px solid ${c};background:#fff;border-radius:12px;padding:0;text-align:center;overflow:hidden;">
        <div style="background:${c};color:#fff;font-size:10px;font-weight:700;padding:3px 0;">${i + 1}단계</div>
        <div style="padding:11px 6px;">${emojiHtml}<div style="font-weight:800;font-size:13px;color:#3A2C30;">${esc(label)}</div></div></td>` +
      (i < card.steps.length - 1 ? `<td style="border:none;text-align:center;color:#D4728A;font-size:18px;width:22px;">&#8594;</td>` : "");
    }).join("");
    return frame(`<table style="border-collapse:separate;width:100%;"><tr>${cells}</tr></table>`);
  }
  if (card.type === "strip") {
    const n = card.items.length;
    const cols = n === 1 ? 1 : n === 2 ? 2 : n === 4 ? 2 : 3;
    const big = n === 1;
    const tiles = card.items.map((it, i) => {
      const label = typeof it === "string" ? it : it.label;
      const emoji = typeof it === "string" ? "" : it.emoji;
      const icon = (typeof it === "string" || !it.icon) ? "" : cardIconSvg(it.icon);
      const iconHtml = emoji ? `<span style="font-size:${big ? 60 : 36}px;line-height:1;">${emoji}</span>` : (icon || `<span style="color:#D4728A;font-weight:800;font-size:22px;">${i + 1}</span>`);
      return `<td style="width:${Math.floor(100 / cols)}%;padding:5px;vertical-align:top;">
        <div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:${big ? "34px 6px" : "14px 6px"};text-align:center;">
          <div style="min-height:${big ? 66 : 40}px;margin-bottom:${big ? 12 : 6}px;">${iconHtml}</div>
          <div style="font-size:${big ? 19 : 14}px;font-weight:800;color:#3A2C30;line-height:1.35;">${esc(label)}</div>
        </div></td>`;
    });
    let rows = "";
    for (let i = 0; i < tiles.length; i += cols) {
      rows += `<tr>${tiles.slice(i, i + cols).join("")}</tr>`;
    }
    return frame(`<table style="border-collapse:collapse;width:100%;">${rows}</table>`);
  }
  if (card.type === "choice") {
    const palette = [["#5B8BB5", "#EEF3FB"], ["#C99A4B", "#FBF6EC"]];
    const cols = card.options.map((op, i) => {
      const label = typeof op === "string" ? op : op.label;
      const emoji = typeof op === "string" ? "" : (op.emoji || "");
      const icon = (typeof op === "string" || !op.icon) ? "" : cardIconSvg(op.icon);
      const inner = emoji ? `<span style="font-size:34px;line-height:1;">${emoji}</span>` : icon;
      const [c, bg] = palette[i % 2];
      return `<td style="width:50%;background:${bg};border:2px solid ${c}55;border-radius:14px;overflow:hidden;vertical-align:top;">
        <div style="background:${c};color:#fff;font-size:12.5px;font-weight:800;text-align:center;padding:6px 4px;">${esc(label)}</div>
        <div style="text-align:center;padding:14px 6px;min-height:38px;">${inner}</div></td>`;
    }).join(`<td style="width:10px;border:none;"></td>`);
    return frame(`<table style="border-collapse:separate;width:100%;"><tr>${cols}</tr></table>`);
  }
  if (card.type === "token") {
    const dots = Array.from({ length: card.count }).map(() =>
      `<span style="display:inline-block;width:38px;height:38px;border:2px dashed #E89AAC;border-radius:11px;color:#F0C0CC;text-align:center;line-height:36px;font-size:18px;margin:3px;">&#9733;</span>`
    ).join("");
    return frame(`<div style="text-align:center;">${dots}<span style="font-size:20px;color:#D4728A;margin:0 6px;">&#8594;</span><span style="display:inline-block;width:46px;height:46px;background:#FFF0F3;border:2px solid #F5A0B1;border-radius:11px;text-align:center;line-height:44px;font-size:24px;">&#127873;</span><div style="font-size:12px;font-weight:700;color:#C4557A;margin-top:8px;">${card.count}개 모으면 좋아하는 활동!</div></div>`);
  }
  if (card.type === "voicemeter") {
    return frame(`<div><div style="display:flex;align-items:center;gap:12px;background:#fff;border:2px solid #2ED4C4;border-radius:14px;padding:8px 12px;margin-bottom:6px;"><div style="width:40px;height:40px;border-radius:50%;background:#2ED4C4;color:#fff;font-weight:900;font-size:20px;text-align:center;line-height:40px;flex-shrink:0;">0</div><div style="flex-shrink:0;"><span style="display:inline-block;width:5px;height:6px;border-radius:1.5px;background:#2ED4C4;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:11px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:16px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:21px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:26px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span></div><div style="margin-left:4px;"><div style="font-size:17px;font-weight:800;color:#D4728A;">조용히</div><div style="font-size:12.5px;color:#888;">소리 안 내기</div></div></div><div style="display:flex;align-items:center;gap:12px;background:#fff;border:2px solid #3FA0FF;border-radius:14px;padding:8px 12px;margin-bottom:6px;"><div style="width:40px;height:40px;border-radius:50%;background:#3FA0FF;color:#fff;font-weight:900;font-size:20px;text-align:center;line-height:40px;flex-shrink:0;">1</div><div style="flex-shrink:0;"><span style="display:inline-block;width:5px;height:6px;border-radius:1.5px;background:#3FA0FF;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:11px;border-radius:1.5px;background:#3FA0FF;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:16px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:21px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:26px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span></div><div style="margin-left:4px;"><div style="font-size:17px;font-weight:800;color:#D4728A;">속삭임</div><div style="font-size:12.5px;color:#888;">비밀 얘기</div></div></div><div style="display:flex;align-items:center;gap:12px;background:#fff;border:2px solid #3FC66B;border-radius:14px;padding:8px 12px;margin-bottom:6px;"><div style="width:40px;height:40px;border-radius:50%;background:#3FC66B;color:#fff;font-weight:900;font-size:20px;text-align:center;line-height:40px;flex-shrink:0;">2</div><div style="flex-shrink:0;"><span style="display:inline-block;width:5px;height:6px;border-radius:1.5px;background:#3FC66B;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:11px;border-radius:1.5px;background:#3FC66B;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:16px;border-radius:1.5px;background:#3FC66B;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:21px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:26px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span></div><div style="margin-left:4px;"><div style="font-size:17px;font-weight:800;color:#D4728A;">작은 소리</div><div style="font-size:12.5px;color:#888;">짝꿍이랑</div></div></div><div style="display:flex;align-items:center;gap:12px;background:#fff;border:2px solid #FFCB2E;border-radius:14px;padding:8px 12px;margin-bottom:6px;"><div style="width:40px;height:40px;border-radius:50%;background:#FFCB2E;color:#fff;font-weight:900;font-size:20px;text-align:center;line-height:40px;flex-shrink:0;">3</div><div style="flex-shrink:0;"><span style="display:inline-block;width:5px;height:6px;border-radius:1.5px;background:#FFCB2E;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:11px;border-radius:1.5px;background:#FFCB2E;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:16px;border-radius:1.5px;background:#FFCB2E;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:21px;border-radius:1.5px;background:#FFCB2E;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:26px;border-radius:1.5px;background:#ECE2E8;vertical-align:bottom;margin-right:2px;"></span></div><div style="margin-left:4px;"><div style="font-size:17px;font-weight:800;color:#D4728A;">보통 소리</div><div style="font-size:12.5px;color:#888;">수업 발표</div></div></div><div style="display:flex;align-items:center;gap:12px;background:#fff;border:2px solid #FF5A6E;border-radius:14px;padding:8px 12px;margin-bottom:6px;"><div style="width:40px;height:40px;border-radius:50%;background:#FF5A6E;color:#fff;font-weight:900;font-size:20px;text-align:center;line-height:40px;flex-shrink:0;">4</div><div style="flex-shrink:0;"><span style="display:inline-block;width:5px;height:6px;border-radius:1.5px;background:#FF5A6E;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:11px;border-radius:1.5px;background:#FF5A6E;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:16px;border-radius:1.5px;background:#FF5A6E;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:21px;border-radius:1.5px;background:#FF5A6E;vertical-align:bottom;margin-right:2px;"></span><span style="display:inline-block;width:5px;height:26px;border-radius:1.5px;background:#FF5A6E;vertical-align:bottom;margin-right:2px;"></span></div><div style="margin-left:4px;"><div style="font-size:17px;font-weight:800;color:#D4728A;">큰 소리</div><div style="font-size:12.5px;color:#888;">운동장에서</div></div></div></div>`);
  }
  if (card.type === "countdown") {
    return frame(`<div style="text-align:center;padding:6px 0;"><span style="display:inline-block;width:40px;height:40px;border-radius:50%;background:#3FC66B;color:#fff;font-weight:900;font-size:19px;text-align:center;line-height:40px;vertical-align:middle;">5</span><span style="color:#F5A0B1;font-size:18px;font-weight:900;margin:0 5px;vertical-align:middle;">&#8250;</span><span style="display:inline-block;width:44px;height:44px;border-radius:50%;background:#2ED4C4;color:#fff;font-weight:900;font-size:20px;text-align:center;line-height:44px;vertical-align:middle;">4</span><span style="color:#F5A0B1;font-size:18px;font-weight:900;margin:0 5px;vertical-align:middle;">&#8250;</span><span style="display:inline-block;width:48px;height:48px;border-radius:50%;background:#3FA0FF;color:#fff;font-weight:900;font-size:22px;text-align:center;line-height:48px;vertical-align:middle;">3</span><span style="color:#F5A0B1;font-size:18px;font-weight:900;margin:0 5px;vertical-align:middle;">&#8250;</span><span style="display:inline-block;width:52px;height:52px;border-radius:50%;background:#FF8A3D;color:#fff;font-weight:900;font-size:24px;text-align:center;line-height:52px;vertical-align:middle;">2</span><span style="color:#F5A0B1;font-size:18px;font-weight:900;margin:0 5px;vertical-align:middle;">&#8250;</span><span style="display:inline-block;width:56px;height:56px;border-radius:50%;background:#FF5A6E;color:#fff;font-weight:900;font-size:26px;text-align:center;line-height:56px;vertical-align:middle;">1</span><div style="margin-top:14px;"><span style="display:inline-block;background:#F5A0B1;color:#fff;font-weight:800;font-size:16px;padding:9px 22px;border-radius:14px;">다음 활동!</span></div></div>`);
  }
  if (card.type === "traffic") {
    return frame(`<table style="width:100%;border-collapse:collapse;"><tr><td style="width:90px;vertical-align:middle;"><div style="background:#3A3A46;border-radius:22px;padding:6px 0;width:76px;margin:0 auto;"><div style="width:56px;height:56px;border-radius:50%;background:#FF5A6E;color:#fff;font-weight:900;font-size:15px;text-align:center;line-height:56px;margin:8px auto;">멈춰</div><div style="width:56px;height:56px;border-radius:50%;background:#FFCB2E;color:#fff;font-weight:900;font-size:15px;text-align:center;line-height:56px;margin:8px auto;">생각</div><div style="width:56px;height:56px;border-radius:50%;background:#3FC66B;color:#fff;font-weight:900;font-size:15px;text-align:center;line-height:56px;margin:8px auto;">행동</div></div></td><td style="vertical-align:middle;padding-left:16px;"><div style="margin-bottom:16px;"><div style="font-size:19px;font-weight:900;color:#D4728A;">멈춰</div><div style="font-size:14px;color:#5A5A66;">잠깐 멈춰요</div></div><div style="margin-bottom:16px;"><div style="font-size:19px;font-weight:900;color:#D4728A;">생각</div><div style="font-size:14px;color:#5A5A66;">어떻게 할까?</div></div><div style="margin-bottom:16px;"><div style="font-size:19px;font-weight:900;color:#D4728A;">행동</div><div style="font-size:14px;color:#5A5A66;">좋은 선택!</div></div></td></tr></table>`);
  }
  if (card.type === "progressbar") {
    return frame(`<div><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="width:20%;height:52px;border:2px dashed #F5A0B1;text-align:center;font-size:26px;font-weight:900;color:#F0DDE6;">1</td><td style="width:20%;height:52px;border:2px dashed #F5A0B1;border-left:none;text-align:center;font-size:26px;font-weight:900;color:#F0DDE6;">2</td><td style="width:20%;height:52px;border:2px dashed #F5A0B1;border-left:none;text-align:center;font-size:26px;font-weight:900;color:#F0DDE6;">3</td><td style="width:20%;height:52px;border:2px dashed #F5A0B1;border-left:none;text-align:center;font-size:26px;font-weight:900;color:#F0DDE6;">4</td><td style="width:20%;height:52px;border:2px dashed #F5A0B1;border-left:none;text-align:center;font-size:26px;font-weight:900;color:#F0DDE6;">5</td></tr></table><div style="font-size:13px;color:#5A5A66;margin-top:8px;">&#8594; 하나 끝낼 때마다 칸을 색칠하거나 스티커로 채워요</div><div style="text-align:center;font-size:17px;font-weight:900;color:#3FC66B;margin-top:6px;">다 채우면 끝! 참 잘했어요</div></div>`);
  }
  if (card.type === "volcano") {
    return frame(`<table style="width:100%;border-collapse:collapse;"><tr><td style="vertical-align:middle;width:150px;text-align:center;"><svg width="150" height="168" viewBox="0 0 150 178" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6F8"/><stop offset="1" stop-color="#FFF0F3"/></linearGradient><filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#A88A64" flood-opacity="0.25"/></filter></defs><ellipse cx="75" cy="158" rx="66" ry="9" fill="#E8D5C0" opacity="0.5"/><path d="M18 156 L54 58 Q62 44 75 44 Q88 44 96 58 L132 156 Z" fill="#CBB392" stroke="#A88A64" stroke-width="2" filter="url(#soft)"/><path d="M54 58 Q62 46 75 46 Q88 46 96 58 L90 70 Q82 62 75 62 Q68 62 60 70 Z" fill="#B89B76" opacity="0.5"/><path d="M22 156 L40 122 L110 122 L128 156 Z" fill="#4CAF63"/><path d="M40 122 L54 92 L96 92 L110 122 Z" fill="#FFCB2E"/><path d="M54 92 L64 66 L86 66 L96 92 Z" fill="#FF8A3D"/><path d="M64 66 L71 50 L79 50 L86 66 Z" fill="#FF5A6E"/><path d="M22 156 L40 122 L110 122 L128 156 Z" fill="none" stroke="#fff" stroke-width="1" opacity="0.35"/><path d="M40 122 L54 92 L96 92 L110 122 Z" fill="none" stroke="#fff" stroke-width="1" opacity="0.35"/><path d="M54 92 L64 66 L86 66 L96 92 Z" fill="none" stroke="#fff" stroke-width="1" opacity="0.35"/><ellipse cx="75" cy="50" rx="15" ry="4.5" fill="#C0392B"/><path d="M62 50 q6 -14 6 -22 M75 49 q0 -18 0 -30 M88 50 q-6 -14 -6 -24" stroke="#FF5A6E" stroke-width="4.5" fill="none" stroke-linecap="round"/><circle cx="68" cy="24" r="4" fill="#FF7A4D"/><circle cx="75" cy="16" r="5" fill="#FF5A6E"/><circle cx="83" cy="22" r="4.2" fill="#FF7A4D"/><circle cx="71" cy="12" r="3" fill="#FFCB2E"/><circle cx="80" cy="10" r="3.2" fill="#FFCB2E"/><circle cx="75" cy="7" r="2.4" fill="#FFE066"/><circle cx="64" cy="30" r="2.2" fill="#FFCB2E"/><circle cx="86" cy="28" r="2.4" fill="#FFCB2E"/></svg></td><td style="vertical-align:middle;padding-left:14px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:#FF5A6E;"></span><span style="font-size:15px;font-weight:800;color:#3A2C30;">4. 폭발!</span></div><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:#FF8A3D;"></span><span style="font-size:15px;font-weight:800;color:#3A2C30;">3. 화가 나요</span></div><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:#FFCB2E;"></span><span style="font-size:15px;font-weight:800;color:#3A2C30;">2. 조금 답답해요</span></div><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:#4CAF63;"></span><span style="font-size:15px;font-weight:800;color:#3A2C30;">1. 괜찮아요</span></div></td></tr></table>`);
  }
  if (card.type === "pinwheel") {
    return frame(`<div style="padding:8px 4px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="width:34%;text-align:center;vertical-align:middle;"><div style="font-size:52px;line-height:1;">🌬️</div><div style="font-size:12px;color:#888;font-weight:700;margin-top:2px;">후~ 불어요</div></td><td style="width:30%;text-align:center;vertical-align:middle;"><svg width="92" height="110" viewBox="0 0 92 118" xmlns="http://www.w3.org/2000/svg"><path d="M46 52 L74 24 A40 40 0 0 1 74 80 Z" fill="#FF9DBB" stroke="#fff" stroke-width="2.5"/><path d="M46 52 L74 80 A40 40 0 0 1 18 80 Z" fill="#8AC7FF" stroke="#fff" stroke-width="2.5"/><path d="M46 52 L18 80 A40 40 0 0 1 18 24 Z" fill="#FFD966" stroke="#fff" stroke-width="2.5"/><path d="M46 52 L18 24 A40 40 0 0 1 74 24 Z" fill="#7BE89B" stroke="#fff" stroke-width="2.5"/><circle cx="46" cy="52" r="8" fill="#9B6BFF" stroke="#fff" stroke-width="2.5"/><rect x="43" y="92" width="6" height="24" rx="3" fill="#B0784A"/></svg></td><td style="width:36%;vertical-align:middle;"><div style="font-size:12.5px;font-weight:800;color:#D4728A;margin-bottom:5px;">숨 길이</div><div style="display:flex;gap:3px;align-items:flex-end;"><div style="width:16%;height:14px;background:#FFD9E4;border-radius:3px;"></div><div style="width:16%;height:20px;background:#FFC2D5;border-radius:3px;"></div><div style="width:16%;height:26px;background:#FF9DBB;border-radius:3px;"></div><div style="width:16%;height:32px;background:#F5A0B1;border-radius:3px;"></div><div style="width:16%;height:38px;background:#E8829A;border-radius:3px;"></div></div><div style="display:flex;justify-content:space-between;font-size:10px;color:#999;margin-top:3px;"><span>짧게</span><span>아주 길게!</span></div></td></tr></table><div style="text-align:center;font-size:13px;font-weight:800;color:#D4728A;margin-top:10px;">길게 불수록 바람개비가 오래 돌아요</div></div>`);
  }
  if (card.type === "distance") {
    return frame(`<div style="padding:6px 2px;"><div style="display:flex;align-items:center;background:#fff;border:2.5px solid #FF5A6E;border-radius:14px;padding:8px 14px;margin-bottom:7px;"><div style="flex:1;font-size:28px;line-height:1;letter-spacing:-6px;">🧒👦</div><div style="text-align:right;"><div style="font-size:15px;font-weight:800;color:#3A2C30;">너무 가까워요</div><div style="font-size:11px;color:#888;">뒤로 한 걸음</div></div></div><div style="display:flex;align-items:center;background:#fff;border:2.5px solid #3FC66B;border-radius:14px;padding:8px 14px;margin-bottom:7px;"><div style="flex:1;font-size:28px;line-height:1;letter-spacing:10px;">🧒👦</div><div style="text-align:right;"><div style="font-size:15px;font-weight:800;color:#3A2C30;">딱 좋아요</div><div style="font-size:11px;color:#888;">이 정도!</div></div></div><div style="display:flex;align-items:center;background:#fff;border:2.5px solid #3FA0FF;border-radius:14px;padding:8px 14px;margin-bottom:7px;"><div style="flex:1;font-size:28px;line-height:1;letter-spacing:46px;">🧒👦</div><div style="text-align:right;"><div style="font-size:15px;font-weight:800;color:#3A2C30;">너무 멀어요</div><div style="font-size:11px;color:#888;">조금 가까이</div></div></div><div style="text-align:center;font-size:12.5px;color:#888;margin-top:6px;">친구와 알맞은 거리를 지켜요</div></div>`);
  }
  if (card.type === "turntable") {
    return frame(`<div style="padding:8px 2px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="text-align:center;vertical-align:top;width:25%;"><div style="font-size:20px;color:#9B6BFF;line-height:1;margin-bottom:2px;">▼</div><div style="display:inline-block;font-size:40px;line-height:1;border-radius:50%;box-shadow:0 0 0 3px #9B6BFF;">🧒</div><div style="font-size:13px;font-weight:800;color:#3A2C30;margin-top:4px;">민준</div><div style="font-size:11px;font-weight:800;color:#9B6BFF;margin-top:2px;">지금 차례!</div></td><td style="text-align:center;vertical-align:top;width:25%;"><div style="height:22px;"></div><div style="display:inline-block;font-size:40px;line-height:1;border-radius:50%;">👧</div><div style="font-size:13px;font-weight:800;color:#3A2C30;margin-top:4px;">서연</div><div style="height:15px;"></div></td><td style="text-align:center;vertical-align:top;width:25%;"><div style="height:22px;"></div><div style="display:inline-block;font-size:40px;line-height:1;border-radius:50%;">👦</div><div style="font-size:13px;font-weight:800;color:#3A2C30;margin-top:4px;">지호</div><div style="height:15px;"></div></td><td style="text-align:center;vertical-align:top;width:25%;"><div style="height:22px;"></div><div style="display:inline-block;font-size:40px;line-height:1;border-radius:50%;">🧒</div><div style="font-size:13px;font-weight:800;color:#3A2C30;margin-top:4px;">하은</div><div style="height:15px;"></div></td></tr></table><div style="text-align:center;font-size:13px;font-weight:800;color:#D4728A;margin-top:8px;">화살표가 가리키는 사람이 차례예요</div></div>`);
  }
  if (card.type === "syllable") {
    return frame(`<div style="text-align:center;"><svg width="100%" viewBox="0 0 440 116" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#D4728A" flood-opacity="0.18"/></filter></defs><circle cx="56" cy="34" r="24" fill="#FF9DBB" filter="url(#sh)"/><ellipse cx="48" cy="27" rx="8" ry="5" fill="#fff" opacity="0.4"/><circle cx="56" cy="34" r="14" fill="#fff" opacity="0.55"/><circle cx="97" cy="34" r="3.5" fill="#F5A0B1"/><circle cx="138" cy="34" r="24" fill="#8AC7FF" filter="url(#sh)"/><ellipse cx="130" cy="27" rx="8" ry="5" fill="#fff" opacity="0.4"/><circle cx="138" cy="34" r="14" fill="#fff" opacity="0.55"/><circle cx="179" cy="34" r="3.5" fill="#F5A0B1"/><circle cx="220" cy="34" r="24" fill="#FFD966" filter="url(#sh)"/><ellipse cx="212" cy="27" rx="8" ry="5" fill="#fff" opacity="0.4"/><circle cx="220" cy="34" r="14" fill="#fff" opacity="0.55"/><circle cx="261" cy="34" r="3.5" fill="#F5A0B1"/><circle cx="302" cy="34" r="24" fill="#7BE89B" filter="url(#sh)"/><ellipse cx="294" cy="27" rx="8" ry="5" fill="#fff" opacity="0.4"/><circle cx="302" cy="34" r="14" fill="#fff" opacity="0.55"/><circle cx="343" cy="34" r="3.5" fill="#F5A0B1"/><circle cx="384" cy="34" r="24" fill="#C9AEFF" filter="url(#sh)"/><ellipse cx="376" cy="27" rx="8" ry="5" fill="#fff" opacity="0.4"/><circle cx="384" cy="34" r="14" fill="#fff" opacity="0.55"/><text x="220" y="80" font-family="Noto Sans CJK KR" font-weight="800" font-size="14" fill="#D4728A" text-anchor="middle">빈 동그라미에 목표 단어를 한 글자씩 써넣으세요</text><text x="220" y="104" font-family="Noto Sans CJK KR" font-size="13" fill="#888" text-anchor="middle">하나씩 짚으며 또박또박 · 음절 추가 방지</text></svg></div>`);
  }
  if (card.type === "slidewindow") {
    return frame(`<div style="text-align:center;"><svg width="100%" viewBox="0 0 440 330" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#D4728A" flood-opacity="0.18"/></filter></defs><g font-family="Noto Sans CJK KR"> <!-- 예시1: 2음절 --> <text x="18" y="46" font-weight="800" font-size="14" fill="#D4728A">2음절</text> <rect x="96" y="20" width="326" height="44" rx="12" fill="#FFF0F3" stroke="#F5A0B1" stroke-width="2"/> <circle cx="128" cy="42" r="14" fill="#7BC47F"/><circle cx="170" cy="42" r="14" fill="#E8829A"/> <rect x="196" y="22" width="224" height="40" rx="10" fill="#F5A0B1" opacity="0.92"/> <rect x="196" y="22" width="224" height="40" rx="10" fill="none" stroke="#E07A93" stroke-width="1.5" opacity="0.5"/> <path d="M210 34 l-8 8 8 8 M204 42 h20" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/> <text x="320" y="47" font-weight="700" font-size="12" fill="#fff" text-anchor="middle">덮개로 가림</text> <!-- 예시2: 4음절 --> <text x="18" y="118" font-weight="800" font-size="14" fill="#D4728A">4음절</text> <rect x="96" y="92" width="326" height="44" rx="12" fill="#FFF0F3" stroke="#F5A0B1" stroke-width="2"/> <circle cx="128" cy="114" r="14" fill="#7BC47F"/><circle cx="170" cy="114" r="14" fill="#E8829A"/><circle cx="212" cy="114" r="14" fill="#C96A82"/><circle cx="254" cy="114" r="14" fill="#E8829A"/> <rect x="280" y="94" width="140" height="40" rx="10" fill="#F5A0B1" opacity="0.92"/> <rect x="280" y="94" width="140" height="40" rx="10" fill="none" stroke="#E07A93" stroke-width="1.5" opacity="0.5"/> <path d="M294 106 l-8 8 8 8 M288 114 h20" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/> <!-- 예시3: 6음절 (덮개 없음) --> <text x="18" y="190" font-weight="800" font-size="14" fill="#D4728A">6음절</text> <rect x="96" y="164" width="326" height="44" rx="12" fill="#FFF0F3" stroke="#F5A0B1" stroke-width="2"/> <circle cx="128" cy="186" r="14" fill="#7BC47F"/><circle cx="170" cy="186" r="14" fill="#E8829A"/><circle cx="212" cy="186" r="14" fill="#C96A82"/><circle cx="254" cy="186" r="14" fill="#E8829A"/><circle cx="296" cy="186" r="14" fill="#C96A82"/><circle cx="338" cy="186" r="14" fill="#D9506E"/> <text x="220" y="224" font-size="13" fill="#5A5A66" text-anchor="middle">덮개를 좌우로 밀어 필요한 음절 수만큼만 보여요</text> <!-- 오려 쓰는 덮개 --> <text x="18" y="258" font-weight="800" font-size="13" fill="#888">✂ 오려 쓰는 덮개</text> <rect x="18" y="266" width="404" height="52" rx="10" fill="#F5A0B1" stroke="#D4728A" stroke-width="1.5" stroke-dasharray="6 4"/> <!-- 왼쪽: 창문(오려낼 구멍) --> <rect x="30" y="276" width="150" height="32" rx="7" fill="#fff" stroke="#E07A93" stroke-width="1.5" stroke-dasharray="5 3"/> <text x="105" y="296" font-weight="700" font-size="11.5" fill="#D4728A" text-anchor="middle">창문 (여기 오려내기)</text> <!-- 오른쪽: 가리는 분홍부분 --> <text x="300" y="288" font-weight="700" font-size="11.5" fill="#fff" text-anchor="middle">이쪽이 동그라미를</text> <text x="300" y="304" font-weight="700" font-size="11.5" fill="#fff" text-anchor="middle">가려줍니다</text> </g></svg></div>`);
  }
  if (card.type === "pecs") {
    return frame(`<div style="padding:8px 4px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="text-align:center;vertical-align:middle;width:19%;"><div style="font-size:44px;line-height:1;">🧒</div><div style="font-size:13px;font-weight:800;color:#D4728A;margin-top:4px;">아이</div></td><td style="text-align:center;vertical-align:middle;width:20%;"><div style="display:inline-block;background:#fff;border:2.5px solid #F5A0B1;border-radius:9px;padding:7px 6px;box-shadow:0 2px 6px rgba(212,114,138,0.18);"><div style="font-size:26px;line-height:1;">🍪</div></div><div style="font-size:11px;font-weight:700;color:#888;margin-top:4px;">그림카드</div></td><td style="text-align:center;vertical-align:middle;width:22%;"><div style="font-size:12px;font-weight:800;color:#4CAF63;margin-bottom:2px;">건네요</div><div style="font-size:30px;color:#4CAF63;line-height:1;font-weight:900;">→</div></td><td style="text-align:center;vertical-align:middle;width:19%;"><div style="font-size:44px;line-height:1;">👩‍🏫</div><div style="font-size:13px;font-weight:800;color:#D4728A;margin-top:4px;">선생님</div></td><td style="text-align:center;vertical-align:middle;width:20%;"><div style="font-size:40px;line-height:1;">🍪</div><div style="font-size:11px;font-weight:700;color:#E0A800;margin-top:4px;">간식</div></td></tr></table><div style="text-align:center;font-size:14px;font-weight:800;color:#D4728A;margin-top:12px;">그림카드를 건네면 원하는 것을 받아요</div><div style="text-align:center;font-size:12px;color:#888;margin-top:4px;">말 대신 그림으로 요청하기 (PECS 1단계)</div></div>`);
  }
  if (card.type === "callcard") {
    return frame(`<div style="padding:10px 4px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="text-align:center;vertical-align:middle;width:26%;"><div style="font-size:48px;line-height:1;">🙋</div></td><td style="text-align:center;vertical-align:middle;width:16%;"><div style="font-size:30px;color:#4CAF63;font-weight:900;line-height:1;">→</div></td><td style="text-align:center;vertical-align:middle;width:58%;"><div style="display:inline-flex;align-items:center;gap:8px;background:#fff;border:2.5px solid #F5A0B1;border-radius:16px;padding:10px 16px;box-shadow:0 2px 8px rgba(212,114,138,0.18);"><span style="min-width:52px;border-bottom:3px dashed #F5A0B1;font-size:20px;font-weight:900;color:#D4728A;text-align:center;padding-bottom:2px;">○○</span><span style="font-size:22px;font-weight:900;color:#4CAF63;">오세요!</span></div></td></tr></table><div style="text-align:center;font-size:13.5px;font-weight:800;color:#D4728A;margin-top:12px;">○○ 칸에 부를 사람(엄마·선생님)을 넣어 쓰세요</div></div>`);
  }
  if (card.type === "corevocab") {
    return frame(`<div style="padding:6px 2px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">➕</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">더</div></div></td><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">🙏</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">주세요</div></div></td><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">✋</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">그만</div></div></td></tr><tr><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">🙋</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">도와줘</div></div></td><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">⭕</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">네</div></div></td><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">❌</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">아니요</div></div></td></tr></table><div style="text-align:center;font-size:12.5px;color:#888;margin-top:8px;">자주 쓰는 핵심 어휘를 손가락으로 짚어 말해요</div></div>`);
  }
  if (card.type === "sentence") {
    return frame(`<div style="text-align:center;"><svg width="100%" viewBox="0 0 440 160" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#D4728A" flood-opacity="0.18"/></filter></defs><rect x="30" y="6" width="48" height="32" rx="9" fill="#D4728A"/><text x="54" y="28" font-family="Noto Sans CJK KR" font-weight="800" font-size="12.5" fill="#fff" text-anchor="middle">1어절</text><rect x="88" y="7" width="64" height="34" rx="10" fill="#fff" stroke="#FF9DBB" stroke-width="2.5" stroke-dasharray="6 4" filter="url(#sh)"/><text x="120" y="31" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F0DDE6" text-anchor="middle">___</text><rect x="30" y="50" width="48" height="32" rx="9" fill="#D4728A"/><text x="54" y="72" font-family="Noto Sans CJK KR" font-weight="800" font-size="12.5" fill="#fff" text-anchor="middle">2어절</text><rect x="88" y="51" width="64" height="34" rx="10" fill="#fff" stroke="#FF9DBB" stroke-width="2.5" stroke-dasharray="6 4" filter="url(#sh)"/><text x="120" y="75" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F0DDE6" text-anchor="middle">___</text><text x="167" y="75" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F5A0B1" text-anchor="middle">+</text><rect x="180" y="51" width="64" height="34" rx="10" fill="#fff" stroke="#8AC7FF" stroke-width="2.5" stroke-dasharray="6 4" filter="url(#sh)"/><text x="212" y="75" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F0DDE6" text-anchor="middle">___</text><rect x="30" y="94" width="48" height="32" rx="9" fill="#D4728A"/><text x="54" y="116" font-family="Noto Sans CJK KR" font-weight="800" font-size="12.5" fill="#fff" text-anchor="middle">3어절</text><rect x="88" y="95" width="64" height="34" rx="10" fill="#fff" stroke="#FF9DBB" stroke-width="2.5" stroke-dasharray="6 4" filter="url(#sh)"/><text x="120" y="119" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F0DDE6" text-anchor="middle">___</text><text x="167" y="119" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F5A0B1" text-anchor="middle">+</text><rect x="180" y="95" width="64" height="34" rx="10" fill="#fff" stroke="#8AC7FF" stroke-width="2.5" stroke-dasharray="6 4" filter="url(#sh)"/><text x="212" y="119" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F0DDE6" text-anchor="middle">___</text><text x="259" y="119" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F5A0B1" text-anchor="middle">+</text><rect x="272" y="95" width="64" height="34" rx="10" fill="#fff" stroke="#FFD966" stroke-width="2.5" stroke-dasharray="6 4" filter="url(#sh)"/><text x="304" y="119" font-family="Noto Sans CJK KR" font-weight="900" font-size="15" fill="#F0DDE6" text-anchor="middle">___</text><text x="220" y="152" font-family="Noto Sans CJK KR" font-size="11.5" fill="#5A5A66" text-anchor="middle">빈 칸에 단어를 채워 점점 길게 (예: 공 → 공 주세요 → 빨간 공 주세요)</text></svg></div>`);
  }
  if (card.type === "relay") {
    return frame(`<div style="padding:8px 4px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:8px;"><tr><td style="width:16%;text-align:center;vertical-align:middle;"><div style="font-size:36px;line-height:1;">🧒</div><div style="font-size:10px;color:#D4728A;font-weight:700;">나</div></td><td style="width:60%;vertical-align:middle;"><div style="background:#FF9DBB;color:#fff;border-radius:16px;border-bottom-left-radius:4px;padding:12px 40px;font-size:14px;font-weight:700;display:inline-block;"></div></td><td style="width:24%;"></td></tr></table><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:8px;"><tr><td style="width:24%;"></td><td style="width:60%;vertical-align:middle;text-align:right;"><div style="background:#8AC7FF;color:#fff;border-radius:16px;border-bottom-right-radius:4px;padding:12px 40px;font-size:14px;font-weight:700;display:inline-block;"></div></td><td style="width:16%;text-align:center;vertical-align:middle;"><div style="font-size:36px;line-height:1;">👦</div><div style="font-size:10px;color:#5B8BB5;font-weight:700;">친구</div></td></tr></table><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="width:16%;text-align:center;vertical-align:middle;"><div style="font-size:36px;line-height:1;">🧒</div></td><td style="width:60%;vertical-align:middle;"><div style="background:#FF9DBB;color:#fff;border-radius:16px;border-bottom-left-radius:4px;padding:12px 40px;font-size:14px;font-weight:700;display:inline-block;"></div></td><td style="width:24%;"></td></tr></table><div style="text-align:center;font-size:13px;font-weight:800;color:#D4728A;margin-top:12px;">한 번씩 주고받으며 대화해요 (내 차례 → 친구 차례)</div></div>`);
  }
  if (card.type === "bodysignal") {
    return frame(`<div style="padding:6px 2px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="width:50%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 8px;box-shadow:0 2px 6px rgba(212,114,138,0.1);display:flex;align-items:center;gap:10px;"><div style="font-size:34px;line-height:1;flex-shrink:0;">🍚</div><div style="text-align:left;"><div style="font-size:16px;font-weight:800;color:#D4728A;">배고파요</div><div style="font-size:11px;color:#888;">배가 꼬르륵</div></div></div></td><td style="width:50%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 8px;box-shadow:0 2px 6px rgba(212,114,138,0.1);display:flex;align-items:center;gap:10px;"><div style="font-size:34px;line-height:1;flex-shrink:0;">🥤</div><div style="text-align:left;"><div style="font-size:16px;font-weight:800;color:#D4728A;">목말라요</div><div style="font-size:11px;color:#888;">입이 말라요</div></div></div></td></tr><tr><td style="width:50%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 8px;box-shadow:0 2px 6px rgba(212,114,138,0.1);display:flex;align-items:center;gap:10px;"><div style="font-size:34px;line-height:1;flex-shrink:0;">😴</div><div style="text-align:left;"><div style="font-size:16px;font-weight:800;color:#D4728A;">피곤해요</div><div style="font-size:11px;color:#888;">눈이 무거워요</div></div></div></td><td style="width:50%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 8px;box-shadow:0 2px 6px rgba(212,114,138,0.1);display:flex;align-items:center;gap:10px;"><div style="font-size:34px;line-height:1;flex-shrink:0;">🥵</div><div style="text-align:left;"><div style="font-size:16px;font-weight:800;color:#D4728A;">더워요</div><div style="font-size:11px;color:#888;">땀이 나요</div></div></div></td></tr></table><div style="text-align:center;font-size:12.5px;color:#888;margin-top:8px;">몸이 보내는 신호를 알아차리고 말로 표현해요</div></div>`);
  }
  if (card.type === "receptive") {
    return frame(`<div style="padding:6px 2px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">🪑</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">앉아요</div></div></td><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">🧍</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">일어서요</div></div></td><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">👏</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">박수 쳐요</div></div></td></tr><tr><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">🤲</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">주세요</div></div></td><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">👆</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">만져요</div></div></td><td style="width:33%;padding:5px;"><div style="background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);"><div style="font-size:32px;line-height:1;">🤗</div><div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;">이리 와요</div></div></td></tr></table><div style="text-align:center;font-size:12.5px;color:#888;margin-top:8px;">말하는 지시를 듣고 그대로 해요 (지시 따르기)</div></div>`);
  }
  if (card.type === "bodyparts") {
    return frame(`<div style="text-align:center;"><svg width="100%" viewBox="0 0 440 172" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#D4728A" flood-opacity="0.18"/></filter></defs><path d="M176 84 q0 -48 44 -48 q44 0 44 48 q-13 -23 -44 -23 q-31 0 -44 23 z" fill="#6B4A2A"/><circle cx="220" cy="90" r="44" fill="#FFE0C4" filter="url(#sh)"/><circle cx="176" cy="90" r="8" fill="#FFE0C4"/><circle cx="264" cy="90" r="8" fill="#FFE0C4"/><ellipse cx="204" cy="82" rx="8" ry="6.5" fill="#fff"/><circle cx="204" cy="82" r="3.5" fill="#3A2C30"/><ellipse cx="236" cy="82" rx="8" ry="6.5" fill="#fff"/><circle cx="236" cy="82" r="3.5" fill="#3A2C30"/><path d="M220 88 q-4 8 0 11 q4 -3 0 -11" fill="#F0B583"/><path d="M206 106 q14 11 28 0" fill="none" stroke="#C0392B" stroke-width="3.5" stroke-linecap="round"/><line x1="192" y1="80" x2="150" y2="66" stroke="#FF5A6E" stroke-width="2"/><rect x="104" y="54" width="44" height="26" rx="13" fill="#FF5A6E"/><text x="126" y="72" font-family="Noto Sans CJK KR" font-weight="900" font-size="14" fill="#fff" text-anchor="middle">눈</text><line x1="248" y1="80" x2="290" y2="66" stroke="#9B6BFF" stroke-width="2"/><rect x="292" y="54" width="44" height="26" rx="13" fill="#9B6BFF"/><text x="314" y="72" font-family="Noto Sans CJK KR" font-weight="900" font-size="14" fill="#fff" text-anchor="middle">귀</text><line x1="196" y1="100" x2="150" y2="120" stroke="#3FA0FF" stroke-width="2"/><rect x="104" y="110" width="44" height="26" rx="13" fill="#3FA0FF"/><text x="126" y="128" font-family="Noto Sans CJK KR" font-weight="900" font-size="14" fill="#fff" text-anchor="middle">코</text><line x1="244" y1="100" x2="290" y2="120" stroke="#3FC66B" stroke-width="2"/><rect x="292" y="110" width="44" height="26" rx="13" fill="#3FC66B"/><text x="314" y="128" font-family="Noto Sans CJK KR" font-weight="900" font-size="14" fill="#fff" text-anchor="middle">입</text><text x="220" y="164" font-family="Noto Sans CJK KR" font-weight="800" font-size="13.5" fill="#D4728A" text-anchor="middle">"눈 어디 있어요?" 물으면 짚어요 (신체 부위)</text></svg></div>`);
  }
  if (card.type === "jointattn") {
    return frame(`<div style="padding:14px 4px;text-align:center;"><div style="display:inline-flex;align-items:center;gap:14px;"><span style="font-size:60px;line-height:1;">👉</span><span style="font-size:64px;line-height:1;">⭐</span></div><div style="font-size:16px;font-weight:800;color:#D4728A;margin-top:14px;">"저기 봐!" 가리키는 곳을 함께 봐요</div><div style="font-size:12.5px;color:#888;margin-top:4px;">선생님이 가리키는 것을 아이도 같이 보기 (공동주의)</div></div>`);
  }
  if (card.type === "eyecontact") {
    return frame(`<div style="padding:14px 4px;text-align:center;"><div style="display:inline-flex;align-items:center;gap:10px;"><span style="font-size:56px;line-height:1;">👩‍🏫</span><span style="font-size:34px;line-height:1;">👀</span><span style="font-size:56px;line-height:1;">🧒</span></div><div style="font-size:16px;font-weight:800;color:#D4728A;margin-top:14px;">"나 봐!" 눈을 마주 봐요</div><div style="font-size:12.5px;color:#888;margin-top:4px;">선생님과 아이가 서로 눈을 보기 (눈맞춤)</div></div>`);
  }
  if (card.type === "imitate") {
    return frame(`<div style="padding:8px 4px;"><div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#888;padding:0 6px 2px;"><span>위: 선생님</span><span>아래: 아이가 따라해요</span></div><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="text-align:center;vertical-align:middle;width:33%;"><div style="font-size:42px;line-height:1.15;">🙌</div><div style="font-size:22px;color:#3FC66B;line-height:1;">↓</div><div style="font-size:42px;line-height:1.15;">🙌</div><div style="font-size:13px;font-weight:800;color:#3A2C30;margin-top:5px;">만세!</div></td><td style="text-align:center;vertical-align:middle;width:33%;"><div style="font-size:42px;line-height:1.15;">🙆</div><div style="font-size:22px;color:#3FC66B;line-height:1;">↓</div><div style="font-size:42px;line-height:1.15;">🙆</div><div style="font-size:13px;font-weight:800;color:#3A2C30;margin-top:5px;">머리 위 동그라미</div></td><td style="text-align:center;vertical-align:middle;width:33%;"><div style="font-size:42px;line-height:1.15;">✌️</div><div style="font-size:22px;color:#3FC66B;line-height:1;">↓</div><div style="font-size:42px;line-height:1.15;">✌️</div><div style="font-size:13px;font-weight:800;color:#3A2C30;margin-top:5px;">브이!</div></td></tr></table><div style="text-align:center;font-size:13px;font-weight:800;color:#D4728A;margin-top:8px;">선생님 동작을 똑같이 따라 해요 (동작 모방)</div></div>`);
  }
  if (card.type === "opposite") {
    return frame(`<div style="padding:6px 2px;"><div style="display:flex;align-items:center;background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:9px 14px;margin-bottom:8px;"><div style="flex:1;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:34px;height:34px;border-radius:50%;background:#FF8A3D;vertical-align:middle;"></span></div><div style="font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;">커요</div></div><div style="flex:0 0 40px;text-align:center;font-size:22px;color:#F5A0B1;font-weight:900;">↔</div><div style="flex:1;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:#FF8A3D;vertical-align:middle;"></span></div><div style="font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;">작아요</div></div></div><div style="display:flex;align-items:center;background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:9px 14px;margin-bottom:8px;"><div style="flex:1;text-align:center;"><div style="line-height:1;"><span style="font-size:15px;letter-spacing:1px;color:#3FC66B;">●●●●●●</span></div><div style="font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;">많아요</div></div><div style="flex:0 0 40px;text-align:center;font-size:22px;color:#F5A0B1;font-weight:900;">↔</div><div style="flex:1;text-align:center;"><div style="line-height:1;"><span style="font-size:15px;letter-spacing:1px;color:#3FC66B;">●●</span></div><div style="font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;">적어요</div></div></div><div style="display:flex;align-items:center;background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:9px 14px;margin-bottom:8px;"><div style="flex:1;text-align:center;"><div style="line-height:1;"><span style="font-size:20px;">🟣🟣</span></div><div style="font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;">같아요</div></div><div style="flex:0 0 40px;text-align:center;font-size:22px;color:#F5A0B1;font-weight:900;">↔</div><div style="flex:1;text-align:center;"><div style="line-height:1;"><span style="font-size:20px;">🟣🟨</span></div><div style="font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;">달라요</div></div></div><div style="text-align:center;font-size:12.5px;color:#888;margin-top:6px;">반대되는 개념을 짝지어 배워요</div></div>`);
  }
  if (card.type === "sorting") {
    return frame(`<div style="padding:6px 2px;"><div style="font-size:13px;font-weight:800;color:#D4728A;margin:0 0 2px 6px;">색깔 맞추기</div><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="width:25%;padding:6px;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:36px;height:36px;border-radius:50%;background:#FF5A6E;"></span></div><div style="font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;">빨강</div></td><td style="width:25%;padding:6px;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:36px;height:36px;border-radius:50%;background:#3FA0FF;"></span></div><div style="font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;">파랑</div></td><td style="width:25%;padding:6px;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:36px;height:36px;border-radius:50%;background:#FFCB2E;"></span></div><div style="font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;">노랑</div></td><td style="width:25%;padding:6px;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:36px;height:36px;border-radius:50%;background:#3FC66B;"></span></div><div style="font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;">초록</div></td></tr></table><div style="font-size:13px;font-weight:800;color:#D4728A;margin:8px 0 2px 6px;">모양 맞추기</div><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr><td style="width:25%;padding:6px;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:36px;height:36px;border-radius:50%;background:#FF9DBB;"></span></div><div style="font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;">동그라미</div></td><td style="width:25%;padding:6px;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:34px;height:34px;border-radius:7px;background:#8AC7FF;"></span></div><div style="font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;">네모</div></td><td style="width:25%;padding:6px;text-align:center;"><div style="line-height:1;"><span style="display:inline-block;width:0;height:0;border-left:19px solid transparent;border-right:19px solid transparent;border-bottom:34px solid #FFCB2E;"></span></div><div style="font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;">세모</div></td><td style="width:25%;padding:6px;text-align:center;"><div style="line-height:1;"><span style="font-size:38px;line-height:1;color:#3FC66B;">★</span></div><div style="font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;">별</div></td></tr></table><div style="text-align:center;font-size:12.5px;color:#888;margin-top:8px;">같은 색·같은 모양끼리 모아요 (분류)</div></div>`);
  }
  if (card.type === "counting") {
    return frame(`<div style="text-align:center;"><svg width="100%" viewBox="0 0 440 220" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#D4728A" flood-opacity="0.18"/></filter></defs><circle cx="201" cy="24" r="16" fill="#FF9DBB" filter="url(#sh)"/><text x="201" y="30" font-family="Noto Sans CJK KR" font-weight="900" font-size="17" fill="#fff" text-anchor="middle">1</text><circle cx="245" cy="24" r="10" fill="#FF5A6E"/><circle cx="186" cy="62" r="16" fill="#8AC7FF" filter="url(#sh)"/><text x="186" y="68" font-family="Noto Sans CJK KR" font-weight="900" font-size="17" fill="#fff" text-anchor="middle">2</text><circle cx="230" cy="62" r="10" fill="#3FA0FF"/><circle cx="260" cy="62" r="10" fill="#3FA0FF"/><circle cx="171" cy="100" r="16" fill="#FFD966" filter="url(#sh)"/><text x="171" y="106" font-family="Noto Sans CJK KR" font-weight="900" font-size="17" fill="#fff" text-anchor="middle">3</text><circle cx="215" cy="100" r="10" fill="#E0A800"/><circle cx="245" cy="100" r="10" fill="#E0A800"/><circle cx="275" cy="100" r="10" fill="#E0A800"/><circle cx="156" cy="138" r="16" fill="#7BE89B" filter="url(#sh)"/><text x="156" y="144" font-family="Noto Sans CJK KR" font-weight="900" font-size="17" fill="#fff" text-anchor="middle">4</text><circle cx="200" cy="138" r="10" fill="#3FC66B"/><circle cx="230" cy="138" r="10" fill="#3FC66B"/><circle cx="260" cy="138" r="10" fill="#3FC66B"/><circle cx="290" cy="138" r="10" fill="#3FC66B"/><circle cx="141" cy="176" r="16" fill="#C9AEFF" filter="url(#sh)"/><text x="141" y="182" font-family="Noto Sans CJK KR" font-weight="900" font-size="17" fill="#fff" text-anchor="middle">5</text><circle cx="185" cy="176" r="10" fill="#9B6BFF"/><circle cx="215" cy="176" r="10" fill="#9B6BFF"/><circle cx="245" cy="176" r="10" fill="#9B6BFF"/><circle cx="275" cy="176" r="10" fill="#9B6BFF"/><circle cx="305" cy="176" r="10" fill="#9B6BFF"/><text x="220" y="214" font-family="Noto Sans CJK KR" font-size="13" fill="#5A5A66" text-anchor="middle">숫자만큼 하나씩 세어요 (1·2·3·4·5)</text></svg></div>`);
  }
  if (card.type === "compare") {
    const cols = card.sides.map((s) => {
      const c = s.good ? "#7BB07B" : "#E57A8A", bg = s.good ? "#F2F9F2" : "#FDF2F4";
      return `<td style="width:50%;background:${bg};border:2px solid ${c}55;border-radius:16px;overflow:hidden;vertical-align:top;">
        <div style="background:${c};color:#fff;font-size:13px;font-weight:800;text-align:center;padding:8px 4px;">${s.good ? "&#9711; " : "&#10007; "}${esc(s.label)}</div>
        <div style="text-align:center;padding:14px 8px;"><div style="font-size:32px;line-height:1;margin-bottom:8px;">${s.emoji}</div><div style="font-size:12px;color:#5A4A4E;line-height:1.5;">${esc(s.desc)}</div></div></td>`;
    }).join(`<td style="width:10px;border:none;"></td>`);
    return frame(`<table style="border-collapse:separate;width:100%;"><tr>${cols}</tr></table>`);
  }
  if (card.type === "bigstep") {
    const cols = ["#5B8BB5", "#7BB07B", "#C99A4B"];
    const cells = card.steps.map((s, i) => {
      const c = cols[i % cols.length];
      return `<td style="border:2px solid ${c};background:#fff;border-radius:14px;overflow:hidden;text-align:center;vertical-align:top;">
        <div style="background:${c};color:#fff;font-size:12.5px;font-weight:800;padding:6px 4px;">${esc(s.head)}</div>
        <div style="padding:14px 8px;"><div style="font-size:36px;line-height:1;margin-bottom:8px;">${s.emoji}</div><div style="font-size:14px;font-weight:800;color:#3A2C30;">${esc(s.label)}</div></div></td>` +
      (i < card.steps.length - 1 ? `<td style="border:none;text-align:center;color:#D4728A;font-size:24px;width:26px;">&#9654;</td>` : "");
    }).join("");
    return frame(`<table style="border-collapse:separate;width:100%;"><tr>${cells}</tr></table>`);
  }
  if (card.type === "photoslot") {
    const showArrow = card.arrow !== false;
    const palette = [["#E8EDF7", "#9CB0DE"], ["#FBEAEE", "#E0A0B0"], ["#EAF5EC", "#9CCBA0"]];
    const photos = card.photos || [];
    const cells = card.slots.map((s, i) => {
      const [bg, bd] = palette[i % palette.length];
      const photo = photos[i];
      const slot = photo
        ? `<div style="width:110px;height:110px;margin:0 auto;border-radius:14px;border:2px solid ${bd};overflow:hidden;background:#fff;"><img src="${photo}" style="width:100%;height:100%;object-fit:contain;"/></div>`
        : `<div style="width:110px;height:110px;margin:0 auto;border-radius:14px;background:${bg};border:2px dashed ${bd};text-align:center;line-height:110px;font-size:26px;color:#B0A0A8;">&#128247;</div>`;
      return `<td style="text-align:center;vertical-align:top;">${slot}
        ${s ? `<div style="font-size:15px;font-weight:800;color:#3A2C30;margin-top:8px;">${esc(s)}</div>` : ""}</td>` +
      (showArrow && i < card.slots.length - 1 ? `<td style="border:none;text-align:center;color:#8A8A8A;font-size:22px;width:24px;">&#8594;</td>` : "");
    }).join("");
    return frame(`<div style="font-size:11px;color:#9A8A8F;text-align:center;margin-bottom:8px;">빈 칸에 실제 사진을 인쇄해 붙여 사용하세요.</div><table style="border-collapse:separate;width:100%;"><tr>${cells}</tr></table>`);
  }
  if (card.type === "team") {
    return frame(`<table style="width:100%;border-collapse:collapse;"><tr>
      <td style="text-align:center;width:33%;"><div style="width:60px;height:60px;border-radius:50%;background:#E8EDF7;border:3px solid #9CB0DE;text-align:center;line-height:58px;font-size:30px;margin:0 auto;">${card.left.emoji}</div><div style="font-size:14px;font-weight:800;margin-top:6px;">${esc(card.left.label)}</div>${card.left.sub ? `<div style="font-size:11px;color:#9A8A8F;">${esc(card.left.sub)}</div>` : ""}</td>
      <td style="text-align:center;width:34%;"><div style="font-size:13px;font-weight:800;color:#C4557A;margin-bottom:4px;">${esc(card.center)}</div><div style="font-size:18px;color:#D4728A;">&#9664;&#8213;&#9654;</div></td>
      <td style="text-align:center;width:33%;"><div style="width:60px;height:60px;border-radius:50%;background:#FBEAEE;border:3px solid #E0A0B0;text-align:center;line-height:58px;font-size:30px;margin:0 auto;">${card.right.emoji}</div><div style="font-size:14px;font-weight:800;margin-top:6px;">${esc(card.right.label)}</div>${card.right.sub ? `<div style="font-size:11px;color:#9A8A8F;">${esc(card.right.sub)}</div>` : ""}</td>
      </tr></table>`);
  }
  return "";
}

// ── 시각카드 라이브러리 (카탈로그) ──────────────────────────
// 편집 모드에서 여기서 골라 추가할 수 있음. 각 카드에 고유 id + category.
const CARD_LIBRARY = [
  // [의사소통 요청]
  { id: "req_help", category: "의사소통", type: "strip", title: "도움 요청 카드", items: [
    { label: "도와주세요", icon: "help" }, { label: "쉬고 싶어요", icon: "rest" } ] },
  { id: "req_want", category: "의사소통", type: "strip", title: "요청 카드", items: [
    { label: "주세요", icon: "give" }, { label: "하고 싶어요", icon: "want" } ] },
  { id: "req_attention", category: "의사소통", type: "strip", title: "관심 요청 카드", items: [
    { label: "봐 주세요", icon: "look" }, { label: "같이 해요", icon: "together" } ] },
  { id: "req_pain", category: "의사소통", type: "strip", title: "아플 때 알리는 카드", items: [
    { label: "아파요", emoji: "🤕" }, { label: "도와주세요", icon: "help" } ] },
  { id: "yesno", category: "의사소통", type: "strip", title: "네 / 아니요 카드", items: [
    { label: "네 (좋아요)", emoji: "⭕" }, { label: "아니요 (싫어요)", emoji: "❌" } ] },

  // [선택]
  { id: "choice_more", category: "선택", type: "choice", title: "선택판 (계속/그만)", options: [
    { label: "더 할래요", icon: "yes" }, { label: "그만할래요", icon: "stop" } ] },
  { id: "choice_turn", category: "선택", type: "choice", title: "차례 카드", options: [
    { label: "내 차례", icon: "me" }, { label: "기다리기", icon: "wait" } ] },
  { id: "choice_feel", category: "선택", type: "choice", title: "지금 기분", options: [
    { label: "괜찮아요", icon: "happy" }, { label: "힘들어요", icon: "sad" } ] },

  // [순서·구조]
  { id: "seq_activity", category: "순서·구조", type: "sequence", title: "활동 순서판", steps: [
    { emoji: "💺", label: "앉기" }, { emoji: "✏️", label: "" }, { emoji: "🧸", label: "쉬기" } ] },
  { id: "seq_firstthen", category: "순서·구조", type: "sequence", title: "먼저 - 그다음", steps: [
    { emoji: "📚", label: "먼저 (할 일)" }, { emoji: "🎈", label: "그다음 (좋아하는 것)" } ] },
  { id: "seq_selfreg", category: "순서·구조", type: "sequence", title: "자기조절 순서", steps: [
    { emoji: "✋", label: "멈추기" }, { emoji: "🌬️", label: "숨쉬기" }, { emoji: "🧸", label: "도구 쓰기" } ] },
  { id: "seq_nowlater", category: "순서·구조", type: "sequence", title: "지금 - 이따가", steps: [
    { emoji: "🚫", label: "지금은 안돼요" }, { emoji: "⏰", label: "이따가 할 수 있어요" } ] },
  { id: "daily", category: "순서·구조", type: "strip", title: "오늘의 일과 (순서)", items: [
    { label: "아침 준비", emoji: "☀️" }, { label: "공부·활동", emoji: "📚" },
    { label: "밥·간식", emoji: "🍽️" }, { label: "놀이·휴식", emoji: "🤸" }, { label: "집에 가기", emoji: "🏠" } ] },

  // [감정·진정]
  { id: "emotion_scale", category: "감정·진정", type: "strip", title: "감정 온도계", items: [
    { label: "편안해요", emoji: "😌" }, { label: "조금 힘들어요", emoji: "😟" },
    { label: "많이 힘들어요", emoji: "😣" }, { label: "폭발하기 직전!", emoji: "😡" } ] },
  { id: "breathing", category: "감정·진정", type: "strip", title: "진정 심호흡 (숨쉬기 순서)", items: [
    { label: "코로 천천히 들이쉬기", emoji: "🌬️" }, { label: "잠깐 멈추기 (하나·둘·셋)", emoji: "✋" },
    { label: "입으로 후~ 내쉬기", emoji: "😮‍💨" } ] },
  { id: "calm_choice", category: "감정·진정", type: "choice", title: "진정 방법 고르기", options: [
    { label: "조용한 곳으로", emoji: "🤫" }, { label: "심호흡 하기", emoji: "🌬️" } ] },

  // [감각]
  { id: "sensory_tool", category: "감각", type: "strip", title: "감각 도구 카드", items: [
    { label: "감각 도구", icon: "fidget" }, { label: "쉼 공간 (조용한 코너)", icon: "corner" } ] },
  { id: "sensory_rest", category: "감각", type: "strip", title: "쉼 공간 카드", items: [
    { label: "쉼 공간", icon: "corner" }, { label: "쉬고 싶어요", icon: "rest" } ] },

  // [강화·보상]
  { id: "token5", category: "강화·보상", type: "token", title: "토큰판 (5개)", count: 5 },
  { id: "token3", category: "강화·보상", type: "token", title: "기다리기 토큰판 (3개)", count: 3 },
  { id: "reinforcer", category: "강화·보상", type: "strip", title: "강화제 메뉴판 (하나 고르기)", items: [
    { label: "간식", emoji: "🍬" }, { label: "좋아하는 장난감", emoji: "🧸" },
    { label: "영상 보기", emoji: "📱" }, { label: "안아주기·칭찬", emoji: "🤗" } ] },

  // [신체·통증]
  { id: "pain_where", category: "신체·통증", type: "strip", title: "어디가 아파요? (짚어보기)", items: [
    { label: "머리", emoji: "😵" }, { label: "귀", emoji: "👂" }, { label: "이(치아)", emoji: "🦷" },
    { label: "코", emoji: "👃" }, { label: "목", emoji: "😷" }, { label: "눈", emoji: "👁️" } ] },
  { id: "pain_level", category: "신체·통증", type: "strip", title: "얼마나 아파요? (통증 정도)", items: [
    { label: "괜찮아요", emoji: "🙂" }, { label: "조금 아파요", emoji: "😟" }, { label: "많이 아파요", emoji: "😣" } ] },

  // [부모교육·안내] — 대비/관계/사진 카드
  { id: "cmp_avoid", category: "부모교육", type: "compare", title: "이렇게 도와주세요", sides: [
    { good: false, label: "매번 피하기", emoji: "🚧😰", desc: "피할수록 → 고집이 더 굳어져요" },
    { good: true, label: "조금씩 유연하게", emoji: "🧸✨", desc: "짧게 허용·대체 → 부드럽게 넘어가요" } ] },
  { id: "cmp_react", category: "부모교육", type: "compare", title: "문제행동에 반응할 때", sides: [
    { good: false, label: "바로 들어주기", emoji: "🍬😮", desc: "떼쓰면 얻어요 → 행동이 늘어요" },
    { good: true, label: "바르게 말하면 주기", emoji: "🗣️👍", desc: "적절히 요청 → 바로 반응해요" } ] },
  { id: "team_family", category: "부모교육", type: "team", title: "한 팀이 되어요", center: "같은 순서·같은 규칙",
    left: { emoji: "👵", label: "양육자 A", sub: "분명하게" }, right: { emoji: "👩", label: "양육자 B", sub: "따뜻하게" } },

  // [순서·구조] — 큰 카드/사진칸
  { id: "big_firstthen", category: "순서·구조", type: "bigstep", title: "먼저 - 그다음 (큰 카드)", steps: [
    { head: "먼저", emoji: "📚", label: "해야 할 일" }, { head: "그다음", emoji: "🛁", label: "좋아하는 것" } ] },
  { id: "photo_nowlater", category: "순서·구조", type: "photoslot", title: "지금 - 다음에 (사진 붙이기)", slots: ["지금", "다음에"] },

  // [의사소통] 추가
  { id: "emotion_express", category: "의사소통", type: "strip", title: "지금 내 기분 (감정 표현)", items: [
    { label: "기뻐요", emoji: "😄" }, { label: "슬퍼요", emoji: "😢" },
    { label: "화나요", emoji: "😠" }, { label: "무서워요", emoji: "😨" } ] },
  { id: "greeting", category: "의사소통", type: "strip", title: "인사 카드", items: [
    { label: "안녕하세요", emoji: "🙋" }, { label: "고마워요", emoji: "🙏" }, { label: "미안해요", emoji: "😌" } ] },
  { id: "toilet", category: "의사소통", type: "strip", title: "화장실 카드", items: [
    { label: "화장실 가고 싶어요", emoji: "🚽" } ] },

  // [순서·구조] 추가
  { id: "arrival", category: "순서·구조", type: "sequence", title: "등원 루틴", steps: [
    { emoji: "🎒", label: "가방 걸기" }, { emoji: "🧼", label: "손 씻기" }, { emoji: "💺", label: "자리 앉기" } ] },
  { id: "handwash", category: "순서·구조", type: "sequence", title: "손 씻기 순서", steps: [
    { emoji: "💧", label: "물 묻히기" }, { emoji: "🧼", label: "비누칠" }, { emoji: "🚿", label: "헹구기" }, { emoji: "✋", label: "닦기" } ] },
  { id: "timer", category: "순서·구조", type: "strip", title: "시각 타이머 (전이 준비)", items: [
    { label: "5분 남았어요", emoji: "⏰" }, { label: "이제 끝낼 시간", emoji: "🔔" } ] },

  // [감정·진정] 추가
  { id: "when_angry", category: "감정·진정", type: "strip", title: "화날 때 할 수 있는 것", items: [
    { label: "심호흡 하기", emoji: "🌬️" }, { label: "잠깐 자리 뜨기", icon: "corner" }, { label: "도와달라고 말하기", icon: "help" } ] },
  { id: "checkin", category: "감정·진정", type: "choice", title: "오늘 내 기분은?", options: [
    { label: "좋아요", icon: "happy" }, { label: "힘들어요", icon: "sad" } ] },

  // [행동·규칙]
  { id: "promise", category: "행동·규칙", type: "strip", title: "우리의 약속", items: [
    { label: "친구와 사이좋게", emoji: "🤝" }, { label: "차례 지키기", emoji: "🔢" }, { label: "선생님 말씀 듣기", emoji: "👂" } ] },
  { id: "quiet_slow", category: "행동·규칙", type: "strip", title: "이렇게 해요", items: [
    { label: "조용히 해요", emoji: "🤫" }, { label: "천천히 걸어요", emoji: "🚶" }, { label: "손은 무릎에", emoji: "🙌" } ] },
  { id: "welldone", category: "행동·규칙", type: "strip", title: "참 잘했어요!", items: [
    { label: "잘했어요", emoji: "👏" }, { label: "최고예요", emoji: "🌟" } ] },

  // [강화·보상] 추가
  { id: "goal_today", category: "강화·보상", type: "photoslot", title: "오늘의 목표 (사진)", slots: ["목표 활동", "보상"] },
  { id: "goal_blank", category: "강화·보상", type: "photoslot", title: "목표 - 보상 (빈칸)", slots: ["", ""] },

  // [의사소통] 추가 2차
  { id: "refuse", category: "의사소통", type: "strip", title: "싫어요 / 그만 카드", items: [
    { label: "싫어요", emoji: "🙅" }, { label: "그만할래요", icon: "stop" }, { label: "멈춰요", emoji: "✋" } ] },
  { id: "more_done", category: "의사소통", type: "choice", title: "더 / 다 했어요", options: [
    { label: "더 주세요", icon: "give" }, { label: "다 했어요", icon: "yes" } ] },
  { id: "choice3", category: "선택", type: "photoslot", title: "골라보세요 (3가지 중)", arrow: false, slots: ["", "", ""] },

  // [순서·구조] 생활자립 루틴
  { id: "brush", category: "순서·구조", type: "sequence", title: "양치 순서", steps: [
    { emoji: "🦷", label: "칫솔에 치약" }, { emoji: "😁", label: "이 닦기" }, { emoji: "💧", label: "헹구기" } ] },
  { id: "dress", category: "순서·구조", type: "sequence", title: "옷 입기 순서", steps: [
    { emoji: "👕", label: "상의" }, { emoji: "👖", label: "하의" }, { emoji: "🧦", label: "양말" }, { emoji: "👟", label: "신발" } ] },
  { id: "bedtime", category: "순서·구조", type: "strip", title: "자기 전 루틴", items: [
    { label: "씻기", emoji: "🛁" }, { label: "양치", emoji: "🦷" }, { label: "잠옷 입기", emoji: "👕" },
    { label: "책 읽기", emoji: "📖" }, { label: "잠자기", emoji: "😴" } ] },
  { id: "mealtime", category: "순서·구조", type: "sequence", title: "식사 순서", steps: [
    { emoji: "💺", label: "자리에 앉기" }, { emoji: "🍚", label: "먹기" }, { emoji: "🍽️", label: "그릇 치우기" } ] },

  // [감정·진정] 세분
  { id: "feel4", category: "감정·진정", type: "strip", title: "내 감정 알기 (4가지)", items: [
    { label: "편안해요", emoji: "😌" }, { label: "불안해요", emoji: "😰" },
    { label: "화나요", emoji: "😠" }, { label: "무서워요", emoji: "😨" } ] },
  { id: "scale5", category: "감정·진정", type: "strip", title: "감정 5점 척도", items: [
    { label: "1 - 괜찮아요", emoji: "😊" }, { label: "2 - 조금 불편", emoji: "🙂" },
    { label: "3 - 힘들어요", emoji: "😟" }, { label: "4 - 많이 힘들어요", emoji: "😣" }, { label: "5 - 폭발 직전!", emoji: "😡" } ] },

  // [행동·규칙] 추가
  { id: "hygiene", category: "행동·규칙", type: "strip", title: "위생 규칙", items: [
    { label: "손 씻어요", emoji: "🧼" }, { label: "마스크 써요", emoji: "😷" } ] },
  { id: "waiting", category: "행동·규칙", type: "strip", title: "기다려요 카드", items: [
    { label: "기다려요", emoji: "⏳" } ] },
  { id: "cleanup", category: "행동·규칙", type: "strip", title: "정리 시간", items: [
    { label: "장난감 제자리에", emoji: "🧸" }, { label: "다 정리했어요", emoji: "✨" } ] },

  // [강화·보상] 추가
  { id: "sticker", category: "강화·보상", type: "token", title: "스티커 판 (5개)", count: 5 },
  { id: "praise_type", category: "강화·보상", type: "strip", title: "칭찬 종류", items: [
    { label: "하이파이브", emoji: "🙌" }, { label: "안아주기", emoji: "🤗" }, { label: "박수", emoji: "👏" } ] },

  // [학습·활동]
  { id: "study_play_tidy", category: "학습·활동", type: "strip", title: "일과 카드 (공부·쉬기·정리)", items: [
    { label: "공부 시간", emoji: "📚" }, { label: "쉬는 시간", emoji: "🧸" }, { label: "정리 시간", emoji: "🧹" } ] },
  { id: "study_time", category: "학습·활동", type: "bigstep", title: "공부하고 놀아요", steps: [
    { head: "공부 시간", emoji: "✏️", label: "학습지 하기" }, { head: "그다음", emoji: "🎈", label: "놀이 시간" } ] },
  { id: "learn_attitude", category: "학습·활동", type: "strip", title: "학습 태도", items: [
    { label: "집중해요", emoji: "🎯" }, { label: "잘 보고 있어요", icon: "look" }, { label: "끝까지 해요", emoji: "💪" } ] },

  // [놀이·상호작용]
  { id: "play_together", category: "놀이·상호작용", type: "strip", title: "같이 놀아요", items: [
    { label: "같이 놀자", icon: "together" }, { label: "내가 할래요", icon: "me" }, { label: "너 먼저 해", emoji: "👉" } ] },
  { id: "take_turns", category: "놀이·상호작용", type: "sequence", title: "순서 바꾸기 (차례 놀이)", steps: [
    { emoji: "🙋", label: "내 차례" }, { emoji: "👉", label: "네 차례" }, { emoji: "🙋", label: "내 차례" } ] },
  { id: "win_lose", category: "놀이·상호작용", type: "choice", title: "이겼어요 / 졌어요", options: [
    { label: "이겼어요", emoji: "🎉" }, { label: "졌어요 (괜찮아)", emoji: "😌" } ] },
  { id: "play_invite", category: "놀이·상호작용", type: "strip", title: "친구에게 말 걸기", items: [
    { label: "같이 할래?", emoji: "🤝" }, { label: "이거 재밌어", emoji: "😄" }, { label: "고마워", emoji: "🙏" } ] },
  { id: "share", category: "놀이·상호작용", type: "choice", title: "나눠 쓰기", options: [
    { label: "같이 써요", emoji: "🤲" }, { label: "빌려줄게", emoji: "🎁" } ] },

  // [시간·개념]
  { id: "time_day", category: "시간·개념", type: "strip", title: "하루 시간 (아침·점심·저녁)", items: [
    { label: "아침", emoji: "🌅" }, { label: "점심", emoji: "☀️" }, { label: "저녁", emoji: "🌙" } ] },
  { id: "time_todaytom", category: "시간·개념", type: "choice", title: "오늘 / 내일", options: [
    { label: "오늘", emoji: "📅" }, { label: "내일", emoji: "➡️" } ] },
  { id: "time_beforeafter", category: "시간·개념", type: "sequence", title: "먼저 - 나중 (시간 순서)", steps: [
    { emoji: "1️⃣", label: "먼저" }, { emoji: "2️⃣", label: "나중에" } ] },
  { id: "time_beforeafter_photo", category: "시간·개념", type: "photoslot", title: "먼저 - 나중 (사진)", slots: ["먼저", "나중에"] },
  { id: "weather", category: "시간·개념", type: "strip", title: "오늘 날씨", items: [
    { label: "맑음", emoji: "☀️" }, { label: "흐림", emoji: "☁️" }, { label: "비", emoji: "🌧️" }, { label: "더워요", emoji: "🥵" }, { label: "추워요", emoji: "🥶" } ] },

  // [자기표현·자율성]
  { id: "offer_help", category: "의사소통", type: "strip", title: "도움·마음 표현 카드", items: [
    { label: "도와주세요", emoji: "🙋" }, { label: "힘들어요", emoji: "😣" }, { label: "같이 할래요", emoji: "🤝" } ] },
  { id: "my_choice", category: "의사소통", type: "choice", title: "내가 정해요", options: [
    { label: "내가 할래요", emoji: "💪" }, { label: "도와주세요", emoji: "🙋" } ] },
  { id: "how_about", category: "의사소통", type: "strip", title: "제안하기", items: [
    { label: "이거 할까요?", emoji: "💡" }, { label: "저기 갈까요?", emoji: "👉" } ] },
  // ── 커스텀 시각카드 (일반/표현언어/발달) ──────────────────
  // [표현언어 → 의사소통]
  { id: "vc_pecs", category: "의사소통", type: "pecs", title: "그림으로 부탁해요 (PECS 교환)" },
  { id: "vc_corevocab", category: "의사소통", type: "corevocab", title: "핵심 어휘 소통판" },
  { id: "vc_callcard", category: "의사소통", type: "callcard", title: "○○ 오세요 (부르기 카드·빈칸)" },
  { id: "vc_relay", category: "의사소통", type: "relay", title: "주고받기 대화 (대화 릴레이)" },
  // [표현언어 → 학습·활동]
  { id: "vc_syllable", category: "학습·활동", type: "syllable", title: "또박또박 말해요 (음절 도트·빈칸)" },
  { id: "vc_slidewindow", category: "학습·활동", type: "slidewindow", title: "한 글자씩 창문 (슬라이드·빈칸)" },
  { id: "vc_sentence", category: "학습·활동", type: "sentence", title: "문장 늘리기 (한 마디→여러 마디)" },

  // [발달 → 학습·활동]
  { id: "vc_receptive", category: "학습·활동", type: "receptive", title: "이렇게 해요 (지시 따르기)" },
  { id: "vc_bodyparts", category: "학습·활동", type: "bodyparts", title: "어디 있나요? (신체 부위)" },
  { id: "vc_opposite", category: "학습·활동", type: "opposite", title: "반대 개념 (크다·많다·같다)" },
  { id: "vc_sorting", category: "학습·활동", type: "sorting", title: "같은 것끼리 (색깔·모양 분류)" },
  { id: "vc_counting", category: "학습·활동", type: "counting", title: "숫자 세기 (1~5)" },
  // [발달 → 놀이·상호작용]
  { id: "vc_jointattn", category: "놀이·상호작용", type: "jointattn", title: "저기 봐! (함께 보기·공동주의)" },
  { id: "vc_eyecontact", category: "놀이·상호작용", type: "eyecontact", title: "나 봐! (눈맞춤)" },
  { id: "vc_imitate", category: "놀이·상호작용", type: "imitate", title: "나처럼 해봐 (동작 모방)" },
  { id: "vc_bodysignal", category: "신체·통증", type: "bodysignal", title: "내 몸이 말해요 (몸 신호)" },

  // [일반 → 시간·개념]
  { id: "vc_countdown", category: "시간·개념", type: "countdown", title: "이제 곧 바꿔요 (5-4-3-2-1)" },
  { id: "vc_progressbar", category: "시간·개념", type: "progressbar", title: "얼마나 남았을까? (진행 막대)" },
  // [일반 → 감정·진정]
  { id: "vc_traffic", category: "감정·진정", type: "traffic", title: "멈춰-생각-행동 (신호등)" },
  { id: "vc_volcano", category: "감정·진정", type: "volcano", title: "내 마음 화산 (지금 몇 층?)" },
  { id: "vc_pinwheel", category: "감정·진정", type: "pinwheel", title: "후~ 불어요! (호흡 연습)" },
  { id: "vc_voicemeter", category: "감정·진정", type: "voicemeter", title: "내 목소리 크기 (0~4단계)" },
  // [일반 → 놀이·상호작용]
  { id: "vc_distance", category: "놀이·상호작용", type: "distance", title: "딱 좋은 거리 (친구와 간격)" },
  { id: "vc_turntable", category: "놀이·상호작용", type: "turntable", title: "누구 차례일까? (차례 표시등)" },
];
const CARD_CATEGORIES = ["의사소통", "선택", "순서·구조", "감정·진정", "감각", "강화·보상", "신체·통증", "부모교육", "행동·규칙", "학습·활동", "놀이·상호작용", "시간·개념"];

function getVisualCards(func) {
  // 여러 기능에 공통으로 유용한 카드 (이모지 기반)
  const emotionScale = { type: "strip", title: "감정 온도계", items: [
    { label: "편안해요", emoji: "😌" },
    { label: "조금 힘들어요", emoji: "😟" },
    { label: "많이 힘들어요", emoji: "😣" },
    { label: "폭발하기 직전!", emoji: "😡" },
  ] };
  const breathing = { type: "strip", title: "진정 심호흡 (숨쉬기 순서)", items: [
    { label: "코로 천천히 들이쉬기", emoji: "🌬️" },
    { label: "잠깐 멈추기 (하나·둘·셋)", emoji: "✋" },
    { label: "입으로 후~ 내쉬기", emoji: "😮‍💨" },
  ] };
  const reinforcerMenu = { type: "strip", title: "강화제 메뉴판 (하나 고르기)", items: [
    { label: "간식", emoji: "🍬" },
    { label: "좋아하는 장난감", emoji: "🧸" },
    { label: "영상 보기", emoji: "📱" },
    { label: "안아주기·칭찬", emoji: "🤗" },
  ] };
  const dailySchedule = { type: "strip", title: "오늘의 일과 (순서)", items: [
    { label: "아침 준비", emoji: "☀️" },
    { label: "공부·활동", emoji: "📚" },
    { label: "밥·간식", emoji: "🍽️" },
    { label: "놀이·휴식", emoji: "🧩" },
    { label: "집에 가기", emoji: "🏠" },
  ] };

  const sets = {
    escape: [
      { type: "receptive", title: "이렇게 해요 (지시 따르기)" },
      { type: "bodyparts", title: "어디 있나요? (신체 부위)" },
      { type: "opposite", title: "반대 개념 (크다·많다·같다)" },
      { type: "sorting", title: "같은 것끼리 (색깔·모양 분류)" },
      { type: "counting", title: "숫자 세기 (1~5)" },
      { type: "syllable", title: "또박또박 말해요 (음절 도트·빈칸)" },
      { type: "slidewindow", title: "한 글자씩 창문 (슬라이드·빈칸)" },
      { type: "sentence", title: "문장 늘리기 (한 마디→여러 마디)" },
      { type: "countdown", title: "이제 곧 바꿔요 (5-4-3-2-1)" },
      { type: "progressbar", title: "얼마나 남았을까? (진행 막대)" },
      { type: "traffic", title: "멈춰-생각-행동 (신호등)" },
      { type: "sequence", title: "활동 순서판", steps: ["앉기", "3개 하기", "쉬기"] },
      { type: "strip", title: "도움 요청 카드", items: [
        { label: "도와주세요", icon: "help" },
        { label: "쉬고 싶어요", icon: "rest" },
      ] },
      { type: "choice", title: "선택판", options: [
        { label: "더 할래요", icon: "yes" },
        { label: "그만할래요", icon: "stop" },
      ] },
      dailySchedule,
      emotionScale,
    ],
    attention: [
      { type: "jointattn", title: "저기 봐! (함께 보기·공동주의)" },
      { type: "eyecontact", title: "나 봐! (눈맞춤)" },
      { type: "imitate", title: "나처럼 해봐 (동작 모방)" },
      { type: "pecs", title: "그림으로 부탁해요 (PECS 교환)" },
      { type: "callcard", title: "○○ 오세요 (부르기 카드·빈칸)" },
      { type: "corevocab", title: "핵심 어휘 소통판" },
      { type: "relay", title: "주고받기 대화 (대화 릴레이)" },
      { type: "syllable", title: "또박또박 말해요 (음절 도트·빈칸)" },
      { type: "slidewindow", title: "한 글자씩 창문 (슬라이드·빈칸)" },
      { type: "sentence", title: "문장 늘리기 (한 마디→여러 마디)" },
      { type: "distance", title: "딱 좋은 거리 (친구와 간격)" },
      { type: "turntable", title: "누구 차례일까? (차례 표시등)" },
      { type: "voicemeter", title: "내 목소리 크기 (0~4단계)" },
      { type: "strip", title: "관심 요청 카드", items: [
        { label: "봐 주세요", icon: "look" },
        { label: "같이 해요", icon: "together" },
      ] },
      { type: "token", title: "토큰판", count: 5 },
      { type: "choice", title: "차례 카드", options: [
        { label: "내 차례", icon: "me" },
        { label: "기다리기", icon: "wait" },
      ] },
      reinforcerMenu,
    ],
    tangible: [
      { type: "countdown", title: "이제 곧 바꿔요 (5-4-3-2-1)" },
      { type: "turntable", title: "누구 차례일까? (차례 표시등)" },
      { type: "receptive", title: "이렇게 해요 (지시 따르기)" },
      { type: "pecs", title: "그림으로 부탁해요 (PECS 교환)" },
      { type: "corevocab", title: "핵심 어휘 소통판" },
      { type: "sequence", title: "지금-다음 카드", steps: ["지금은 안돼요", "이따가"] },
      { type: "strip", title: "요청 카드", items: [
        { label: "주세요", icon: "give" },
        { label: "하고 싶어요", icon: "want" },
      ] },
      { type: "token", title: "기다리기 토큰판", count: 3 },
      reinforcerMenu,
    ],
    sensory: [
      { type: "voicemeter", title: "내 목소리 크기 (0~4단계)" },
      { type: "volcano", title: "내 마음 화산 (지금 몇 층?)" },
      { type: "pinwheel", title: "후~ 불어요! (호흡 연습)" },
      { type: "traffic", title: "멈춰-생각-행동 (신호등)" },
      { type: "strip", title: "감각 도구 카드", items: [
        { label: "감각 도구", icon: "fidget" },
        { label: "쉼 공간 (조용한 코너)", icon: "corner" },
      ] },
      { type: "sequence", title: "자기조절 순서", steps: ["멈추기", "숨쉬기", "도구 쓰기"] },
      { type: "choice", title: "지금 기분", options: [
        { label: "괜찮아요", icon: "happy" },
        { label: "힘들어요", icon: "sad" },
      ] },
      breathing,
      emotionScale,
    ],
    physical: [
      { type: "bodyparts", title: "어디 있나요? (신체 부위)" },
      { type: "bodysignal", title: "내 몸이 말해요 (몸 신호)" },
      { type: "strip", title: "아플 때 알리는 카드", items: [
        { label: "아파요", emoji: "🤕" },
        { label: "도와주세요", icon: "help" },
      ] },
      { type: "strip", title: "어디가 아파요? (짚어보기)", items: [
        { label: "머리", emoji: "😵" },
        { label: "배", emoji: "🤢" },
        { label: "귀", emoji: "👂" },
        { label: "이(치아)", emoji: "🦷" },
      ] },
      { type: "strip", title: "얼마나 아파요? (통증 정도)", items: [
        { label: "괜찮아요", emoji: "🙂" },
        { label: "조금 아파요", emoji: "😟" },
        { label: "많이 아파요", emoji: "😣" },
      ] },
      { type: "strip", title: "쉼 공간 (조용한 코너)", items: [
        { label: "쉼 공간", icon: "corner" },
        { label: "쉬고 싶어요", icon: "rest" },
      ] },
      breathing,
    ],
  };
  return sets[func] || sets.escape;
}

function CardFrame({ title, children, accent = "#D4728A", accentBg = "#FFF0F3" }) {
  return (
    <div style={{ background: "#fff", border: `2px solid ${accent}33`, borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 10px rgba(212,114,138,0.08)", marginBottom: 4 }}>
      <div style={{ background: accent, color: "#fff", fontSize: 13.5, fontWeight: 800, padding: "9px 14px", letterSpacing: "0.2px" }}>{title}</div>
      <div style={{ padding: 14, background: accentBg }}>{children}</div>
    </div>
  );
}

// ── 시각카드용 컬러 픽토그램 아이콘 (화면용, 워드 대신 PDF에서 렌더) ──
function CardIcon({ name, size = 34 }) {
  // 이모지로 표현하는 아이콘 (표정·사람 동작·명확한 사물)
  const emojiMap = {
    help: "🙋", rest: "😌", look: "👀", together: "🤝", me: "🙋",
    wait: "⏳", give: "🤲", want: "❤️", corner: "🏠", happy: "😊", sad: "😢",
  };
  if (emojiMap[name]) {
    return <span style={{ fontSize: size * 1.15, lineHeight: 1, display: "inline-block" }}>{emojiMap[name]}</span>;
  }
  // SVG로 유지하는 아이콘 (브랜드 톤·ABA 상징성 중요: yes/stop/fidget)
  const svg = { width: size, height: size, viewBox: "0 0 48 48", xmlns: "http://www.w3.org/2000/svg" };
  const icons = {
    // 예/더하기 — 체크 동그라미(초록)
    yes: <><circle cx="24" cy="24" r="16" fill="#DCF0E1" stroke="#5C9A72" strokeWidth="2.4" /><path d="M16 24l5 5 11-11" fill="none" stroke="#5C9A72" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></>,
    // 그만 — 팔각형(빨강, 고퀄)
    stop: <><path d="M17 5h14l12 12v14L31 43H17L5 31V17z" fill="#E84D7F"/><ellipse cx="18" cy="13" rx="5" ry="2.6" fill="#fff" opacity="0.28"/><path d="M18 18l12 12M30 18L18 30" stroke="#fff" strokeWidth="3.2" strokeLinecap="round"/></>,
    // 감각 도구 — 별모양 감각공
    fidget: <><circle cx="24" cy="24" r="13" fill="#D9C9F0" stroke="#8A6FB0" strokeWidth="2" /><g fill="#B79AE0"><circle cx="24" cy="9" r="3.5" /><circle cx="24" cy="39" r="3.5" /><circle cx="9" cy="24" r="3.5" /><circle cx="39" cy="24" r="3.5" /><circle cx="13" cy="13" r="3" /><circle cx="35" cy="13" r="3" /><circle cx="13" cy="35" r="3" /><circle cx="35" cy="35" r="3" /></g><circle cx="24" cy="24" r="5" fill="#fff" opacity="0.6" /></>,
  };
  return <svg {...svg}>{icons[name] || icons.yes}</svg>;
}

function VisualCard({ card, slotEditable, onSlotPhoto }) {
  if (card.type === "sequence") {
    const stepColors = ["#5B8BB5", "#7BB07B", "#C99A4B", "#9B7BB5"];
    const vertical = card.steps.length >= 4; // 4단계 이상은 세로 배치
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "center", gap: vertical ? 4 : 6, justifyContent: "center" }}>
          {card.steps.map((st, i) => {
            const col = stepColors[i % stepColors.length];
            const label = typeof st === "string" ? st : st.label;
            const emoji = typeof st === "string" ? null : st.emoji;
            return (
              <React.Fragment key={i}>
                <div style={{ flex: vertical ? "none" : "1 1 0", width: vertical ? "100%" : "auto", minWidth: vertical ? "auto" : 64, background: "#fff", border: `2px solid ${col}`, borderRadius: 12, overflow: "hidden", textAlign: "center" }}>
                  <div style={{ background: col, color: "#fff", fontSize: 10.5, fontWeight: 700, padding: "3px 0" }}>{i + 1}단계</div>
                  <div style={{ padding: vertical ? "10px 6px" : "12px 6px" }}>
                    {emoji && <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 5 }}>{emoji}</div>}
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#3A2C30" }}>{label}</div>
                  </div>
                </div>
                {i < card.steps.length - 1 && <span style={{ fontSize: 20, color: "#D4728A", flexShrink: 0 }}>{vertical ? "\u2193" : "\u2192"}</span>}
              </React.Fragment>
            );
          })}
        </div>
      </CardFrame>
    );
  }
  if (card.type === "strip") {
    const n = card.items.length;
    const cols = n === 1 ? 1 : n === 2 ? 2 : n === 4 ? 2 : 3; // 4개는 2x2, 나머지 최대 3열
    const big = n === 1; // 1개짜리는 크게
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
          {card.items.map((it, i) => {
            const label = typeof it === "string" ? it : it.label;
            const icon = typeof it === "string" ? null : it.icon;
            const emoji = typeof it === "string" ? null : it.emoji;
            return (
              <div key={i} style={{ background: "#fff", border: "2px solid #F5A0B1", borderRadius: 14, padding: big ? "36px 8px" : "16px 8px", textAlign: "center", boxShadow: "0 1px 4px rgba(212,114,138,0.06)" }}>
                <div style={{ marginBottom: big ? 14 : 8, display: "flex", justifyContent: "center", alignItems: "center", minHeight: big ? 70 : 42 }}>
                  {emoji ? <span style={{ fontSize: big ? 68 : 40, lineHeight: 1 }}>{emoji}</span> : icon ? <CardIcon name={icon} size={big ? 68 : 40} /> : <span style={{ color: "#D4728A", fontWeight: 800, fontSize: 24 }}>{i + 1}</span>}
                </div>
                <div style={{ fontSize: big ? 20 : 14.5, fontWeight: 800, color: "#3A2C30", lineHeight: 1.35 }}>{label}</div>
              </div>
            );
          })}
        </div>
      </CardFrame>
    );
  }
  if (card.type === "choice") {
    const cols = [["#5B8BB5", "#EEF3FB"], ["#C99A4B", "#FBF6EC"]];
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "flex", gap: 12 }}>
          {card.options.map((op, i) => {
            const label = typeof op === "string" ? op : op.label;
            const icon = typeof op === "string" ? null : op.icon;
            const emoji = typeof op === "string" ? null : op.emoji;
            const [col, bg] = cols[i % 2];
            return (
              <div key={i} style={{ flex: 1, borderRadius: 16, overflow: "hidden", border: `2px solid ${col}55`, background: bg }}>
                <div style={{ background: col, color: "#fff", fontSize: 13, fontWeight: 800, textAlign: "center", padding: "7px 4px" }}>{label}</div>
                <div style={{ padding: "16px 8px", textAlign: "center", minHeight: 40 }}>
                  {emoji ? <span style={{ fontSize: 38, lineHeight: 1 }}>{emoji}</span>
                    : icon ? <div style={{ display: "flex", justifyContent: "center" }}><CardIcon name={icon} size={40} /></div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardFrame>
    );
  }
  if (card.type === "token") {
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {Array.from({ length: card.count }).map((_, i) => (
              <div key={i} style={{ width: 44, height: 44, borderRadius: 12, border: "2px dashed #E89AAC", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#F0C0CC" }}>{"\u2605"}</div>
            ))}
          </div>
          <span style={{ fontSize: 22, color: "#D4728A" }}>{"\u2192"}</span>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: "#FFF0F3", border: "2px solid #F5A0B1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🎁</div>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#C4557A" }}>{card.count}개 모으면 좋아하는 활동!</div>
      </CardFrame>
    );
  }
  if (card.type === "voicemeter") {
    return (
      <CardFrame title={card.title}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"2px solid #2ED4C4", borderRadius:14, padding:"8px 12px", marginBottom:6 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:"#2ED4C4", color:"#fff", fontWeight:900, fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>0</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:34, flexShrink:0 }}><div style={{ width:5, height:6, borderRadius:1.5, background:"#2ED4C4" }} /><div style={{ width:5, height:11, borderRadius:1.5, background:"#ECE2E8" }} /><div style={{ width:5, height:16, borderRadius:1.5, background:"#ECE2E8" }} /><div style={{ width:5, height:21, borderRadius:1.5, background:"#ECE2E8" }} /><div style={{ width:5, height:26, borderRadius:1.5, background:"#ECE2E8" }} /></div>
            <div style={{ marginLeft:4 }}>
              <div style={{ fontSize:17, fontWeight:800, color:"#D4728A" }}>조용히</div>
              <div style={{ fontSize:12.5, color:"#888" }}>소리 안 내기</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"2px solid #3FA0FF", borderRadius:14, padding:"8px 12px", marginBottom:6 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:"#3FA0FF", color:"#fff", fontWeight:900, fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>1</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:34, flexShrink:0 }}><div style={{ width:5, height:6, borderRadius:1.5, background:"#3FA0FF" }} /><div style={{ width:5, height:11, borderRadius:1.5, background:"#3FA0FF" }} /><div style={{ width:5, height:16, borderRadius:1.5, background:"#ECE2E8" }} /><div style={{ width:5, height:21, borderRadius:1.5, background:"#ECE2E8" }} /><div style={{ width:5, height:26, borderRadius:1.5, background:"#ECE2E8" }} /></div>
            <div style={{ marginLeft:4 }}>
              <div style={{ fontSize:17, fontWeight:800, color:"#D4728A" }}>속삭임</div>
              <div style={{ fontSize:12.5, color:"#888" }}>비밀 얘기</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"2px solid #3FC66B", borderRadius:14, padding:"8px 12px", marginBottom:6 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:"#3FC66B", color:"#fff", fontWeight:900, fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>2</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:34, flexShrink:0 }}><div style={{ width:5, height:6, borderRadius:1.5, background:"#3FC66B" }} /><div style={{ width:5, height:11, borderRadius:1.5, background:"#3FC66B" }} /><div style={{ width:5, height:16, borderRadius:1.5, background:"#3FC66B" }} /><div style={{ width:5, height:21, borderRadius:1.5, background:"#ECE2E8" }} /><div style={{ width:5, height:26, borderRadius:1.5, background:"#ECE2E8" }} /></div>
            <div style={{ marginLeft:4 }}>
              <div style={{ fontSize:17, fontWeight:800, color:"#D4728A" }}>작은 소리</div>
              <div style={{ fontSize:12.5, color:"#888" }}>짝꿍이랑</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"2px solid #FFCB2E", borderRadius:14, padding:"8px 12px", marginBottom:6 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:"#FFCB2E", color:"#fff", fontWeight:900, fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>3</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:34, flexShrink:0 }}><div style={{ width:5, height:6, borderRadius:1.5, background:"#FFCB2E" }} /><div style={{ width:5, height:11, borderRadius:1.5, background:"#FFCB2E" }} /><div style={{ width:5, height:16, borderRadius:1.5, background:"#FFCB2E" }} /><div style={{ width:5, height:21, borderRadius:1.5, background:"#FFCB2E" }} /><div style={{ width:5, height:26, borderRadius:1.5, background:"#ECE2E8" }} /></div>
            <div style={{ marginLeft:4 }}>
              <div style={{ fontSize:17, fontWeight:800, color:"#D4728A" }}>보통 소리</div>
              <div style={{ fontSize:12.5, color:"#888" }}>수업 발표</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"2px solid #FF5A6E", borderRadius:14, padding:"8px 12px", marginBottom:6 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:"#FF5A6E", color:"#fff", fontWeight:900, fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>4</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:34, flexShrink:0 }}><div style={{ width:5, height:6, borderRadius:1.5, background:"#FF5A6E" }} /><div style={{ width:5, height:11, borderRadius:1.5, background:"#FF5A6E" }} /><div style={{ width:5, height:16, borderRadius:1.5, background:"#FF5A6E" }} /><div style={{ width:5, height:21, borderRadius:1.5, background:"#FF5A6E" }} /><div style={{ width:5, height:26, borderRadius:1.5, background:"#FF5A6E" }} /></div>
            <div style={{ marginLeft:4 }}>
              <div style={{ fontSize:17, fontWeight:800, color:"#D4728A" }}>큰 소리</div>
              <div style={{ fontSize:12.5, color:"#888" }}>운동장에서</div>
            </div>
          </div>
        </div>
      </CardFrame>
    );
  }
  if (card.type === "countdown") {
    return (
      <CardFrame title={card.title}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
          <div style={{ width:40, height:40, borderRadius:"50%", background:"#3FC66B", color:"#fff", fontWeight:900, fontSize:19, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>5</div>
          <span style={{ color:"#F5A0B1", fontSize:18, fontWeight:900 }}>&#8250;</span>
          <div style={{ width:44, height:44, borderRadius:"50%", background:"#2ED4C4", color:"#fff", fontWeight:900, fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>4</div>
          <span style={{ color:"#F5A0B1", fontSize:18, fontWeight:900 }}>&#8250;</span>
          <div style={{ width:48, height:48, borderRadius:"50%", background:"#3FA0FF", color:"#fff", fontWeight:900, fontSize:22, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>3</div>
          <span style={{ color:"#F5A0B1", fontSize:18, fontWeight:900 }}>&#8250;</span>
          <div style={{ width:52, height:52, borderRadius:"50%", background:"#FF8A3D", color:"#fff", fontWeight:900, fontSize:24, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>2</div>
          <span style={{ color:"#F5A0B1", fontSize:18, fontWeight:900 }}>&#8250;</span>
          <div style={{ width:56, height:56, borderRadius:"50%", background:"#FF5A6E", color:"#fff", fontWeight:900, fontSize:26, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>1</div>
        </div>
        <div style={{ textAlign:"center", marginTop:14 }}>
          <span style={{ display:"inline-block", background:"#F5A0B1", color:"#fff", fontWeight:800, fontSize:16, padding:"9px 22px", borderRadius:14 }}>다음 활동!</span>
        </div>
      </CardFrame>
    );
  }
  if (card.type === "traffic") {
    return (
      <CardFrame title={card.title}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ background:"#3A3A46", borderRadius:22, padding:"6px 0", width:76, flexShrink:0 }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:"#FF5A6E", color:"#fff", fontWeight:900, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", margin:"8px auto" }}>멈춰</div>
            <div style={{ width:56, height:56, borderRadius:"50%", background:"#FFCB2E", color:"#fff", fontWeight:900, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", margin:"8px auto" }}>생각</div>
            <div style={{ width:56, height:56, borderRadius:"50%", background:"#3FC66B", color:"#fff", fontWeight:900, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", margin:"8px auto" }}>행동</div>
          </div>
          <div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:19, fontWeight:900, color:"#D4728A" }}>멈춰</div>
              <div style={{ fontSize:14, color:"#5A5A66" }}>잠깐 멈춰요</div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:19, fontWeight:900, color:"#D4728A" }}>생각</div>
              <div style={{ fontSize:14, color:"#5A5A66" }}>어떻게 할까?</div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:19, fontWeight:900, color:"#D4728A" }}>행동</div>
              <div style={{ fontSize:14, color:"#5A5A66" }}>좋은 선택!</div>
            </div>
          </div>
        </div>
      </CardFrame>
    );
  }
  if (card.type === "progressbar") {
    return (
      <CardFrame title={card.title}>
        <div style={{ display:"flex" }}>
            <div style={{ flex:1, height:52, border:"2px dashed #F5A0B1", borderLeft:"2px dashed #F5A0B1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:"#F0DDE6" }}>1</div>
            <div style={{ flex:1, height:52, border:"2px dashed #F5A0B1", borderLeft:"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:"#F0DDE6" }}>2</div>
            <div style={{ flex:1, height:52, border:"2px dashed #F5A0B1", borderLeft:"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:"#F0DDE6" }}>3</div>
            <div style={{ flex:1, height:52, border:"2px dashed #F5A0B1", borderLeft:"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:"#F0DDE6" }}>4</div>
            <div style={{ flex:1, height:52, border:"2px dashed #F5A0B1", borderLeft:"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:900, color:"#F0DDE6" }}>5</div>
        </div>
        <div style={{ fontSize:13, color:"#5A5A66", marginTop:8 }}>&#8594; 하나 끝낼 때마다 칸을 색칠하거나 스티커로 채워요</div>
        <div style={{ textAlign:"center", fontSize:17, fontWeight:900, color:"#3FC66B", marginTop:6 }}>다 채우면 끝! 참 잘했어요</div>
      </CardFrame>
    );
  }
  if (card.type === "volcano") {
    return (
      <CardFrame title={card.title}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ flexShrink:0 }} dangerouslySetInnerHTML={{ __html: "<svg width=\"150\" height=\"168\" viewBox=\"0 0 150 178\" xmlns=\"http://www.w3.org/2000/svg\"><defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFF6F8\"/><stop offset=\"1\" stop-color=\"#FFF0F3\"/></linearGradient><filter id=\"soft\" x=\"-30%\" y=\"-30%\" width=\"160%\" height=\"160%\"><feDropShadow dx=\"0\" dy=\"2\" stdDeviation=\"2.5\" flood-color=\"#A88A64\" flood-opacity=\"0.25\"/></filter></defs><ellipse cx=\"75\" cy=\"158\" rx=\"66\" ry=\"9\" fill=\"#E8D5C0\" opacity=\"0.5\"/><path d=\"M18 156 L54 58 Q62 44 75 44 Q88 44 96 58 L132 156 Z\" fill=\"#CBB392\" stroke=\"#A88A64\" stroke-width=\"2\" filter=\"url(#soft)\"/><path d=\"M54 58 Q62 46 75 46 Q88 46 96 58 L90 70 Q82 62 75 62 Q68 62 60 70 Z\" fill=\"#B89B76\" opacity=\"0.5\"/><path d=\"M22 156 L40 122 L110 122 L128 156 Z\" fill=\"#4CAF63\"/><path d=\"M40 122 L54 92 L96 92 L110 122 Z\" fill=\"#FFCB2E\"/><path d=\"M54 92 L64 66 L86 66 L96 92 Z\" fill=\"#FF8A3D\"/><path d=\"M64 66 L71 50 L79 50 L86 66 Z\" fill=\"#FF5A6E\"/><path d=\"M22 156 L40 122 L110 122 L128 156 Z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1\" opacity=\"0.35\"/><path d=\"M40 122 L54 92 L96 92 L110 122 Z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1\" opacity=\"0.35\"/><path d=\"M54 92 L64 66 L86 66 L96 92 Z\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1\" opacity=\"0.35\"/><ellipse cx=\"75\" cy=\"50\" rx=\"15\" ry=\"4.5\" fill=\"#C0392B\"/><path d=\"M62 50 q6 -14 6 -22 M75 49 q0 -18 0 -30 M88 50 q-6 -14 -6 -24\" stroke=\"#FF5A6E\" stroke-width=\"4.5\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"68\" cy=\"24\" r=\"4\" fill=\"#FF7A4D\"/><circle cx=\"75\" cy=\"16\" r=\"5\" fill=\"#FF5A6E\"/><circle cx=\"83\" cy=\"22\" r=\"4.2\" fill=\"#FF7A4D\"/><circle cx=\"71\" cy=\"12\" r=\"3\" fill=\"#FFCB2E\"/><circle cx=\"80\" cy=\"10\" r=\"3.2\" fill=\"#FFCB2E\"/><circle cx=\"75\" cy=\"7\" r=\"2.4\" fill=\"#FFE066\"/><circle cx=\"64\" cy=\"30\" r=\"2.2\" fill=\"#FFCB2E\"/><circle cx=\"86\" cy=\"28\" r=\"2.4\" fill=\"#FFCB2E\"/></svg>" }} />
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <span style={{ width:18, height:18, borderRadius:5, background:"#FF5A6E", display:"inline-block" }} />
              <span style={{ fontSize:15, fontWeight:800, color:"#3A2C30" }}>4. 폭발!</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <span style={{ width:18, height:18, borderRadius:5, background:"#FF8A3D", display:"inline-block" }} />
              <span style={{ fontSize:15, fontWeight:800, color:"#3A2C30" }}>3. 화가 나요</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <span style={{ width:18, height:18, borderRadius:5, background:"#FFCB2E", display:"inline-block" }} />
              <span style={{ fontSize:15, fontWeight:800, color:"#3A2C30" }}>2. 조금 답답해요</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <span style={{ width:18, height:18, borderRadius:5, background:"#4CAF63", display:"inline-block" }} />
              <span style={{ fontSize:15, fontWeight:800, color:"#3A2C30" }}>1. 괜찮아요</span>
            </div>
          </div>
        </div>
      </CardFrame>
    );
  }
  if (card.type === "pinwheel") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:8px 4px;\"><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"width:34%;text-align:center;vertical-align:middle;\"><div style=\"font-size:52px;line-height:1;\">🌬️</div><div style=\"font-size:12px;color:#888;font-weight:700;margin-top:2px;\">후~ 불어요</div></td><td style=\"width:30%;text-align:center;vertical-align:middle;\"><svg width=\"92\" height=\"110\" viewBox=\"0 0 92 118\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M46 52 L74 24 A40 40 0 0 1 74 80 Z\" fill=\"#FF9DBB\" stroke=\"#fff\" stroke-width=\"2.5\"/><path d=\"M46 52 L74 80 A40 40 0 0 1 18 80 Z\" fill=\"#8AC7FF\" stroke=\"#fff\" stroke-width=\"2.5\"/><path d=\"M46 52 L18 80 A40 40 0 0 1 18 24 Z\" fill=\"#FFD966\" stroke=\"#fff\" stroke-width=\"2.5\"/><path d=\"M46 52 L18 24 A40 40 0 0 1 74 24 Z\" fill=\"#7BE89B\" stroke=\"#fff\" stroke-width=\"2.5\"/><circle cx=\"46\" cy=\"52\" r=\"8\" fill=\"#9B6BFF\" stroke=\"#fff\" stroke-width=\"2.5\"/><rect x=\"43\" y=\"92\" width=\"6\" height=\"24\" rx=\"3\" fill=\"#B0784A\"/></svg></td><td style=\"width:36%;vertical-align:middle;\"><div style=\"font-size:12.5px;font-weight:800;color:#D4728A;margin-bottom:5px;\">숨 길이</div><div style=\"display:flex;gap:3px;align-items:flex-end;\"><div style=\"width:16%;height:14px;background:#FFD9E4;border-radius:3px;\"></div><div style=\"width:16%;height:20px;background:#FFC2D5;border-radius:3px;\"></div><div style=\"width:16%;height:26px;background:#FF9DBB;border-radius:3px;\"></div><div style=\"width:16%;height:32px;background:#F5A0B1;border-radius:3px;\"></div><div style=\"width:16%;height:38px;background:#E8829A;border-radius:3px;\"></div></div><div style=\"display:flex;justify-content:space-between;font-size:10px;color:#999;margin-top:3px;\"><span>짧게</span><span>아주 길게!</span></div></td></tr></table><div style=\"text-align:center;font-size:13px;font-weight:800;color:#D4728A;margin-top:10px;\">길게 불수록 바람개비가 오래 돌아요</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "distance") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:6px 2px;\"><div style=\"display:flex;align-items:center;background:#fff;border:2.5px solid #FF5A6E;border-radius:14px;padding:8px 14px;margin-bottom:7px;\"><div style=\"flex:1;font-size:28px;line-height:1;letter-spacing:-6px;\">🧒👦</div><div style=\"text-align:right;\"><div style=\"font-size:15px;font-weight:800;color:#3A2C30;\">너무 가까워요</div><div style=\"font-size:11px;color:#888;\">뒤로 한 걸음</div></div></div><div style=\"display:flex;align-items:center;background:#fff;border:2.5px solid #3FC66B;border-radius:14px;padding:8px 14px;margin-bottom:7px;\"><div style=\"flex:1;font-size:28px;line-height:1;letter-spacing:10px;\">🧒👦</div><div style=\"text-align:right;\"><div style=\"font-size:15px;font-weight:800;color:#3A2C30;\">딱 좋아요</div><div style=\"font-size:11px;color:#888;\">이 정도!</div></div></div><div style=\"display:flex;align-items:center;background:#fff;border:2.5px solid #3FA0FF;border-radius:14px;padding:8px 14px;margin-bottom:7px;\"><div style=\"flex:1;font-size:28px;line-height:1;letter-spacing:46px;\">🧒👦</div><div style=\"text-align:right;\"><div style=\"font-size:15px;font-weight:800;color:#3A2C30;\">너무 멀어요</div><div style=\"font-size:11px;color:#888;\">조금 가까이</div></div></div><div style=\"text-align:center;font-size:12.5px;color:#888;margin-top:6px;\">친구와 알맞은 거리를 지켜요</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "turntable") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:8px 2px;\"><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"text-align:center;vertical-align:top;width:25%;\"><div style=\"font-size:20px;color:#9B6BFF;line-height:1;margin-bottom:2px;\">▼</div><div style=\"display:inline-block;font-size:40px;line-height:1;border-radius:50%;box-shadow:0 0 0 3px #9B6BFF;\">🧒</div><div style=\"font-size:13px;font-weight:800;color:#3A2C30;margin-top:4px;\">민준</div><div style=\"font-size:11px;font-weight:800;color:#9B6BFF;margin-top:2px;\">지금 차례!</div></td><td style=\"text-align:center;vertical-align:top;width:25%;\"><div style=\"height:22px;\"></div><div style=\"display:inline-block;font-size:40px;line-height:1;border-radius:50%;\">👧</div><div style=\"font-size:13px;font-weight:800;color:#3A2C30;margin-top:4px;\">서연</div><div style=\"height:15px;\"></div></td><td style=\"text-align:center;vertical-align:top;width:25%;\"><div style=\"height:22px;\"></div><div style=\"display:inline-block;font-size:40px;line-height:1;border-radius:50%;\">👦</div><div style=\"font-size:13px;font-weight:800;color:#3A2C30;margin-top:4px;\">지호</div><div style=\"height:15px;\"></div></td><td style=\"text-align:center;vertical-align:top;width:25%;\"><div style=\"height:22px;\"></div><div style=\"display:inline-block;font-size:40px;line-height:1;border-radius:50%;\">🧒</div><div style=\"font-size:13px;font-weight:800;color:#3A2C30;margin-top:4px;\">하은</div><div style=\"height:15px;\"></div></td></tr></table><div style=\"text-align:center;font-size:13px;font-weight:800;color:#D4728A;margin-top:8px;\">화살표가 가리키는 사람이 차례예요</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "syllable") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"text-align:center;\"><svg width=\"100%\" viewBox=\"0 0 440 116\" xmlns=\"http://www.w3.org/2000/svg\"><defs><filter id=\"sh\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feDropShadow dx=\"0\" dy=\"2\" stdDeviation=\"2\" flood-color=\"#D4728A\" flood-opacity=\"0.18\"/></filter></defs><circle cx=\"56\" cy=\"34\" r=\"24\" fill=\"#FF9DBB\" filter=\"url(#sh)\"/><ellipse cx=\"48\" cy=\"27\" rx=\"8\" ry=\"5\" fill=\"#fff\" opacity=\"0.4\"/><circle cx=\"56\" cy=\"34\" r=\"14\" fill=\"#fff\" opacity=\"0.55\"/><circle cx=\"97\" cy=\"34\" r=\"3.5\" fill=\"#F5A0B1\"/><circle cx=\"138\" cy=\"34\" r=\"24\" fill=\"#8AC7FF\" filter=\"url(#sh)\"/><ellipse cx=\"130\" cy=\"27\" rx=\"8\" ry=\"5\" fill=\"#fff\" opacity=\"0.4\"/><circle cx=\"138\" cy=\"34\" r=\"14\" fill=\"#fff\" opacity=\"0.55\"/><circle cx=\"179\" cy=\"34\" r=\"3.5\" fill=\"#F5A0B1\"/><circle cx=\"220\" cy=\"34\" r=\"24\" fill=\"#FFD966\" filter=\"url(#sh)\"/><ellipse cx=\"212\" cy=\"27\" rx=\"8\" ry=\"5\" fill=\"#fff\" opacity=\"0.4\"/><circle cx=\"220\" cy=\"34\" r=\"14\" fill=\"#fff\" opacity=\"0.55\"/><circle cx=\"261\" cy=\"34\" r=\"3.5\" fill=\"#F5A0B1\"/><circle cx=\"302\" cy=\"34\" r=\"24\" fill=\"#7BE89B\" filter=\"url(#sh)\"/><ellipse cx=\"294\" cy=\"27\" rx=\"8\" ry=\"5\" fill=\"#fff\" opacity=\"0.4\"/><circle cx=\"302\" cy=\"34\" r=\"14\" fill=\"#fff\" opacity=\"0.55\"/><circle cx=\"343\" cy=\"34\" r=\"3.5\" fill=\"#F5A0B1\"/><circle cx=\"384\" cy=\"34\" r=\"24\" fill=\"#C9AEFF\" filter=\"url(#sh)\"/><ellipse cx=\"376\" cy=\"27\" rx=\"8\" ry=\"5\" fill=\"#fff\" opacity=\"0.4\"/><circle cx=\"384\" cy=\"34\" r=\"14\" fill=\"#fff\" opacity=\"0.55\"/><text x=\"220\" y=\"80\" font-family=\"Noto Sans CJK KR\" font-weight=\"800\" font-size=\"14\" fill=\"#D4728A\" text-anchor=\"middle\">빈 동그라미에 목표 단어를 한 글자씩 써넣으세요</text><text x=\"220\" y=\"104\" font-family=\"Noto Sans CJK KR\" font-size=\"13\" fill=\"#888\" text-anchor=\"middle\">하나씩 짚으며 또박또박 · 음절 추가 방지</text></svg></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "slidewindow") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<svg width=\"100%\" viewBox=\"0 0 440 330\" xmlns=\"http://www.w3.org/2000/svg\"><defs><filter id=\"sh\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feDropShadow dx=\"0\" dy=\"2\" stdDeviation=\"3\" flood-color=\"#D4728A\" flood-opacity=\"0.18\"/></filter></defs><g font-family=\"Noto Sans CJK KR\"> <!-- 예시1: 2음절 --> <text x=\"18\" y=\"46\" font-weight=\"800\" font-size=\"14\" fill=\"#D4728A\">2음절</text> <rect x=\"96\" y=\"20\" width=\"326\" height=\"44\" rx=\"12\" fill=\"#FFF0F3\" stroke=\"#F5A0B1\" stroke-width=\"2\"/> <circle cx=\"128\" cy=\"42\" r=\"14\" fill=\"#7BC47F\"/><circle cx=\"170\" cy=\"42\" r=\"14\" fill=\"#E8829A\"/> <rect x=\"196\" y=\"22\" width=\"224\" height=\"40\" rx=\"10\" fill=\"#F5A0B1\" opacity=\"0.92\"/> <rect x=\"196\" y=\"22\" width=\"224\" height=\"40\" rx=\"10\" fill=\"none\" stroke=\"#E07A93\" stroke-width=\"1.5\" opacity=\"0.5\"/> <path d=\"M210 34 l-8 8 8 8 M204 42 h20\" stroke=\"#fff\" stroke-width=\"2.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> <text x=\"320\" y=\"47\" font-weight=\"700\" font-size=\"12\" fill=\"#fff\" text-anchor=\"middle\">덮개로 가림</text> <!-- 예시2: 4음절 --> <text x=\"18\" y=\"118\" font-weight=\"800\" font-size=\"14\" fill=\"#D4728A\">4음절</text> <rect x=\"96\" y=\"92\" width=\"326\" height=\"44\" rx=\"12\" fill=\"#FFF0F3\" stroke=\"#F5A0B1\" stroke-width=\"2\"/> <circle cx=\"128\" cy=\"114\" r=\"14\" fill=\"#7BC47F\"/><circle cx=\"170\" cy=\"114\" r=\"14\" fill=\"#E8829A\"/><circle cx=\"212\" cy=\"114\" r=\"14\" fill=\"#C96A82\"/><circle cx=\"254\" cy=\"114\" r=\"14\" fill=\"#E8829A\"/> <rect x=\"280\" y=\"94\" width=\"140\" height=\"40\" rx=\"10\" fill=\"#F5A0B1\" opacity=\"0.92\"/> <rect x=\"280\" y=\"94\" width=\"140\" height=\"40\" rx=\"10\" fill=\"none\" stroke=\"#E07A93\" stroke-width=\"1.5\" opacity=\"0.5\"/> <path d=\"M294 106 l-8 8 8 8 M288 114 h20\" stroke=\"#fff\" stroke-width=\"2.5\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> <!-- 예시3: 6음절 (덮개 없음) --> <text x=\"18\" y=\"190\" font-weight=\"800\" font-size=\"14\" fill=\"#D4728A\">6음절</text> <rect x=\"96\" y=\"164\" width=\"326\" height=\"44\" rx=\"12\" fill=\"#FFF0F3\" stroke=\"#F5A0B1\" stroke-width=\"2\"/> <circle cx=\"128\" cy=\"186\" r=\"14\" fill=\"#7BC47F\"/><circle cx=\"170\" cy=\"186\" r=\"14\" fill=\"#E8829A\"/><circle cx=\"212\" cy=\"186\" r=\"14\" fill=\"#C96A82\"/><circle cx=\"254\" cy=\"186\" r=\"14\" fill=\"#E8829A\"/><circle cx=\"296\" cy=\"186\" r=\"14\" fill=\"#C96A82\"/><circle cx=\"338\" cy=\"186\" r=\"14\" fill=\"#D9506E\"/> <text x=\"220\" y=\"224\" font-size=\"13\" fill=\"#5A5A66\" text-anchor=\"middle\">덮개를 좌우로 밀어 필요한 음절 수만큼만 보여요</text> <!-- 오려 쓰는 덮개 --> <text x=\"18\" y=\"258\" font-weight=\"800\" font-size=\"13\" fill=\"#888\">✂ 오려 쓰는 덮개</text> <rect x=\"18\" y=\"266\" width=\"404\" height=\"52\" rx=\"10\" fill=\"#F5A0B1\" stroke=\"#D4728A\" stroke-width=\"1.5\" stroke-dasharray=\"6 4\"/> <!-- 왼쪽: 창문(오려낼 구멍) --> <rect x=\"30\" y=\"276\" width=\"150\" height=\"32\" rx=\"7\" fill=\"#fff\" stroke=\"#E07A93\" stroke-width=\"1.5\" stroke-dasharray=\"5 3\"/> <text x=\"105\" y=\"296\" font-weight=\"700\" font-size=\"11.5\" fill=\"#D4728A\" text-anchor=\"middle\">창문 (여기 오려내기)</text> <!-- 오른쪽: 가리는 분홍부분 --> <text x=\"300\" y=\"288\" font-weight=\"700\" font-size=\"11.5\" fill=\"#fff\" text-anchor=\"middle\">이쪽이 동그라미를</text> <text x=\"300\" y=\"304\" font-weight=\"700\" font-size=\"11.5\" fill=\"#fff\" text-anchor=\"middle\">가려줍니다</text> </g></svg>" }} />
      </CardFrame>
    );
  }
  if (card.type === "pecs") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:8px 4px;\"><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"text-align:center;vertical-align:middle;width:19%;\"><div style=\"font-size:44px;line-height:1;\">🧒</div><div style=\"font-size:13px;font-weight:800;color:#D4728A;margin-top:4px;\">아이</div></td><td style=\"text-align:center;vertical-align:middle;width:20%;\"><div style=\"display:inline-block;background:#fff;border:2.5px solid #F5A0B1;border-radius:9px;padding:7px 6px;box-shadow:0 2px 6px rgba(212,114,138,0.18);\"><div style=\"font-size:26px;line-height:1;\">🍪</div></div><div style=\"font-size:11px;font-weight:700;color:#888;margin-top:4px;\">그림카드</div></td><td style=\"text-align:center;vertical-align:middle;width:22%;\"><div style=\"font-size:12px;font-weight:800;color:#3FC66B;margin-bottom:2px;\">건네요</div><div style=\"font-size:30px;color:#3FC66B;line-height:1;font-weight:900;\">→</div></td><td style=\"text-align:center;vertical-align:middle;width:19%;\"><div style=\"font-size:44px;line-height:1;\">👩‍🏫</div><div style=\"font-size:13px;font-weight:800;color:#D4728A;margin-top:4px;\">선생님</div></td><td style=\"text-align:center;vertical-align:middle;width:20%;\"><div style=\"font-size:40px;line-height:1;\">🍪</div><div style=\"font-size:11px;font-weight:700;color:#E0A800;margin-top:4px;\">간식</div></td></tr></table><div style=\"text-align:center;font-size:14px;font-weight:800;color:#D4728A;margin-top:12px;\">그림카드를 건네면 원하는 것을 받아요</div><div style=\"text-align:center;font-size:12px;color:#888;margin-top:4px;\">말 대신 그림으로 요청하기 (PECS 1단계)</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "callcard") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:10px 4px;\"><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"text-align:center;vertical-align:middle;width:26%;\"><div style=\"font-size:48px;line-height:1;\">🙋</div></td><td style=\"text-align:center;vertical-align:middle;width:16%;\"><div style=\"font-size:30px;color:#3FC66B;font-weight:900;line-height:1;\">→</div></td><td style=\"text-align:center;vertical-align:middle;width:58%;\"><div style=\"display:inline-flex;align-items:center;gap:8px;background:#fff;border:2.5px solid #F5A0B1;border-radius:16px;padding:10px 16px;box-shadow:0 2px 8px rgba(212,114,138,0.18);\"><span style=\"min-width:52px;border-bottom:3px dashed #F5A0B1;font-size:20px;font-weight:900;color:#D4728A;text-align:center;padding-bottom:2px;\">○○</span><span style=\"font-size:22px;font-weight:900;color:#3FC66B;\">오세요!</span></div></td></tr></table><div style=\"text-align:center;font-size:13.5px;font-weight:800;color:#D4728A;margin-top:12px;\">○○ 칸에 부를 사람(엄마·선생님)을 넣어 쓰세요</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "corevocab") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:6px 2px;\"><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">➕</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">더</div></div></td><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">🙏</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">주세요</div></div></td><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">✋</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">그만</div></div></td></tr><tr><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">🙋</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">도와줘</div></div></td><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">⭕</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">네</div></div></td><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">❌</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">아니요</div></div></td></tr></table><div style=\"text-align:center;font-size:12.5px;color:#888;margin-top:8px;\">자주 쓰는 핵심 어휘를 손가락으로 짚어 말해요</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "sentence") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"text-align:center;\"><svg width=\"100%\" viewBox=\"0 0 440 160\" xmlns=\"http://www.w3.org/2000/svg\"><defs><filter id=\"sh\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feDropShadow dx=\"0\" dy=\"2\" stdDeviation=\"2\" flood-color=\"#D4728A\" flood-opacity=\"0.18\"/></filter></defs><rect x=\"30\" y=\"6\" width=\"48\" height=\"32\" rx=\"9\" fill=\"#D4728A\"/><text x=\"54\" y=\"28\" font-family=\"Noto Sans CJK KR\" font-weight=\"800\" font-size=\"12.5\" fill=\"#fff\" text-anchor=\"middle\">1어절</text><rect x=\"88\" y=\"7\" width=\"64\" height=\"34\" rx=\"10\" fill=\"#fff\" stroke=\"#FF9DBB\" stroke-width=\"2.5\" stroke-dasharray=\"6 4\" filter=\"url(#sh)\"/><text x=\"120\" y=\"31\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F0DDE6\" text-anchor=\"middle\">___</text><rect x=\"30\" y=\"50\" width=\"48\" height=\"32\" rx=\"9\" fill=\"#D4728A\"/><text x=\"54\" y=\"72\" font-family=\"Noto Sans CJK KR\" font-weight=\"800\" font-size=\"12.5\" fill=\"#fff\" text-anchor=\"middle\">2어절</text><rect x=\"88\" y=\"51\" width=\"64\" height=\"34\" rx=\"10\" fill=\"#fff\" stroke=\"#FF9DBB\" stroke-width=\"2.5\" stroke-dasharray=\"6 4\" filter=\"url(#sh)\"/><text x=\"120\" y=\"75\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F0DDE6\" text-anchor=\"middle\">___</text><text x=\"167\" y=\"75\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F5A0B1\" text-anchor=\"middle\">+</text><rect x=\"180\" y=\"51\" width=\"64\" height=\"34\" rx=\"10\" fill=\"#fff\" stroke=\"#8AC7FF\" stroke-width=\"2.5\" stroke-dasharray=\"6 4\" filter=\"url(#sh)\"/><text x=\"212\" y=\"75\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F0DDE6\" text-anchor=\"middle\">___</text><rect x=\"30\" y=\"94\" width=\"48\" height=\"32\" rx=\"9\" fill=\"#D4728A\"/><text x=\"54\" y=\"116\" font-family=\"Noto Sans CJK KR\" font-weight=\"800\" font-size=\"12.5\" fill=\"#fff\" text-anchor=\"middle\">3어절</text><rect x=\"88\" y=\"95\" width=\"64\" height=\"34\" rx=\"10\" fill=\"#fff\" stroke=\"#FF9DBB\" stroke-width=\"2.5\" stroke-dasharray=\"6 4\" filter=\"url(#sh)\"/><text x=\"120\" y=\"119\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F0DDE6\" text-anchor=\"middle\">___</text><text x=\"167\" y=\"119\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F5A0B1\" text-anchor=\"middle\">+</text><rect x=\"180\" y=\"95\" width=\"64\" height=\"34\" rx=\"10\" fill=\"#fff\" stroke=\"#8AC7FF\" stroke-width=\"2.5\" stroke-dasharray=\"6 4\" filter=\"url(#sh)\"/><text x=\"212\" y=\"119\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F0DDE6\" text-anchor=\"middle\">___</text><text x=\"259\" y=\"119\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F5A0B1\" text-anchor=\"middle\">+</text><rect x=\"272\" y=\"95\" width=\"64\" height=\"34\" rx=\"10\" fill=\"#fff\" stroke=\"#FFD966\" stroke-width=\"2.5\" stroke-dasharray=\"6 4\" filter=\"url(#sh)\"/><text x=\"304\" y=\"119\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"15\" fill=\"#F0DDE6\" text-anchor=\"middle\">___</text><text x=\"220\" y=\"152\" font-family=\"Noto Sans CJK KR\" font-size=\"11.5\" fill=\"#5A5A66\" text-anchor=\"middle\">빈 칸에 단어를 채워 점점 길게 (예: 공 → 공 주세요 → 빨간 공 주세요)</text></svg></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "relay") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:8px 4px;\"><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:8px;\"><tr><td style=\"width:16%;text-align:center;vertical-align:middle;\"><div style=\"font-size:36px;line-height:1;\">🧒</div><div style=\"font-size:10px;color:#D4728A;font-weight:700;\">나</div></td><td style=\"width:60%;vertical-align:middle;\"><div style=\"background:#FF9DBB;color:#fff;border-radius:16px;border-bottom-left-radius:4px;padding:12px 40px;font-size:14px;font-weight:700;display:inline-block;\"></div></td><td style=\"width:24%;\"></td></tr></table><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:8px;\"><tr><td style=\"width:24%;\"></td><td style=\"width:60%;vertical-align:middle;text-align:right;\"><div style=\"background:#8AC7FF;color:#fff;border-radius:16px;border-bottom-right-radius:4px;padding:12px 40px;font-size:14px;font-weight:700;display:inline-block;\"></div></td><td style=\"width:16%;text-align:center;vertical-align:middle;\"><div style=\"font-size:36px;line-height:1;\">👦</div><div style=\"font-size:10px;color:#5B8BB5;font-weight:700;\">친구</div></td></tr></table><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"width:16%;text-align:center;vertical-align:middle;\"><div style=\"font-size:36px;line-height:1;\">🧒</div></td><td style=\"width:60%;vertical-align:middle;\"><div style=\"background:#FF9DBB;color:#fff;border-radius:16px;border-bottom-left-radius:4px;padding:12px 40px;font-size:14px;font-weight:700;display:inline-block;\"></div></td><td style=\"width:24%;\"></td></tr></table><div style=\"text-align:center;font-size:13px;font-weight:800;color:#D4728A;margin-top:12px;\">한 번씩 주고받으며 대화해요 (내 차례 → 친구 차례)</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "bodysignal") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:6px 2px;\"><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"width:50%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 8px;box-shadow:0 2px 6px rgba(212,114,138,0.1);display:flex;align-items:center;gap:10px;\"><div style=\"font-size:34px;line-height:1;flex-shrink:0;\">🍚</div><div style=\"text-align:left;\"><div style=\"font-size:16px;font-weight:800;color:#D4728A;\">배고파요</div><div style=\"font-size:11px;color:#888;\">배가 꼬르륵</div></div></div></td><td style=\"width:50%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 8px;box-shadow:0 2px 6px rgba(212,114,138,0.1);display:flex;align-items:center;gap:10px;\"><div style=\"font-size:34px;line-height:1;flex-shrink:0;\">🥤</div><div style=\"text-align:left;\"><div style=\"font-size:16px;font-weight:800;color:#D4728A;\">목말라요</div><div style=\"font-size:11px;color:#888;\">입이 말라요</div></div></div></td></tr><tr><td style=\"width:50%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 8px;box-shadow:0 2px 6px rgba(212,114,138,0.1);display:flex;align-items:center;gap:10px;\"><div style=\"font-size:34px;line-height:1;flex-shrink:0;\">😴</div><div style=\"text-align:left;\"><div style=\"font-size:16px;font-weight:800;color:#D4728A;\">피곤해요</div><div style=\"font-size:11px;color:#888;\">눈이 무거워요</div></div></div></td><td style=\"width:50%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 8px;box-shadow:0 2px 6px rgba(212,114,138,0.1);display:flex;align-items:center;gap:10px;\"><div style=\"font-size:34px;line-height:1;flex-shrink:0;\">🥵</div><div style=\"text-align:left;\"><div style=\"font-size:16px;font-weight:800;color:#D4728A;\">더워요</div><div style=\"font-size:11px;color:#888;\">땀이 나요</div></div></div></td></tr></table><div style=\"text-align:center;font-size:12.5px;color:#888;margin-top:8px;\">몸이 보내는 신호를 알아차리고 말로 표현해요</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "receptive") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:6px 2px;\"><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">🪑</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">앉아요</div></div></td><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">🧍</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">일어서요</div></div></td><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">👏</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">박수 쳐요</div></div></td></tr><tr><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">🤲</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">주세요</div></div></td><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">👆</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">만져요</div></div></td><td style=\"width:33%;padding:5px;\"><div style=\"background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:10px 4px;text-align:center;box-shadow:0 2px 6px rgba(212,114,138,0.1);\"><div style=\"font-size:32px;line-height:1;\">🤗</div><div style=\"font-size:15px;font-weight:800;color:#3A2C30;margin-top:6px;\">이리 와요</div></div></td></tr></table><div style=\"text-align:center;font-size:12.5px;color:#888;margin-top:8px;\">말하는 지시를 듣고 그대로 해요 (지시 따르기)</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "bodyparts") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"text-align:center;\"><svg width=\"100%\" viewBox=\"0 0 440 172\" xmlns=\"http://www.w3.org/2000/svg\"><defs><filter id=\"sh\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feDropShadow dx=\"0\" dy=\"2\" stdDeviation=\"2\" flood-color=\"#D4728A\" flood-opacity=\"0.18\"/></filter></defs><path d=\"M176 84 q0 -48 44 -48 q44 0 44 48 q-13 -23 -44 -23 q-31 0 -44 23 z\" fill=\"#6B4A2A\"/><circle cx=\"220\" cy=\"90\" r=\"44\" fill=\"#FFE0C4\" filter=\"url(#sh)\"/><circle cx=\"176\" cy=\"90\" r=\"8\" fill=\"#FFE0C4\"/><circle cx=\"264\" cy=\"90\" r=\"8\" fill=\"#FFE0C4\"/><ellipse cx=\"204\" cy=\"82\" rx=\"8\" ry=\"6.5\" fill=\"#fff\"/><circle cx=\"204\" cy=\"82\" r=\"3.5\" fill=\"#3A2C30\"/><ellipse cx=\"236\" cy=\"82\" rx=\"8\" ry=\"6.5\" fill=\"#fff\"/><circle cx=\"236\" cy=\"82\" r=\"3.5\" fill=\"#3A2C30\"/><path d=\"M220 88 q-4 8 0 11 q4 -3 0 -11\" fill=\"#F0B583\"/><path d=\"M206 106 q14 11 28 0\" fill=\"none\" stroke=\"#C0392B\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><line x1=\"192\" y1=\"80\" x2=\"150\" y2=\"66\" stroke=\"#FF5A6E\" stroke-width=\"2\"/><rect x=\"104\" y=\"54\" width=\"44\" height=\"26\" rx=\"13\" fill=\"#FF5A6E\"/><text x=\"126\" y=\"72\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"14\" fill=\"#fff\" text-anchor=\"middle\">눈</text><line x1=\"248\" y1=\"80\" x2=\"290\" y2=\"66\" stroke=\"#9B6BFF\" stroke-width=\"2\"/><rect x=\"292\" y=\"54\" width=\"44\" height=\"26\" rx=\"13\" fill=\"#9B6BFF\"/><text x=\"314\" y=\"72\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"14\" fill=\"#fff\" text-anchor=\"middle\">귀</text><line x1=\"196\" y1=\"100\" x2=\"150\" y2=\"120\" stroke=\"#3FA0FF\" stroke-width=\"2\"/><rect x=\"104\" y=\"110\" width=\"44\" height=\"26\" rx=\"13\" fill=\"#3FA0FF\"/><text x=\"126\" y=\"128\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"14\" fill=\"#fff\" text-anchor=\"middle\">코</text><line x1=\"244\" y1=\"100\" x2=\"290\" y2=\"120\" stroke=\"#3FC66B\" stroke-width=\"2\"/><rect x=\"292\" y=\"110\" width=\"44\" height=\"26\" rx=\"13\" fill=\"#3FC66B\"/><text x=\"314\" y=\"128\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"14\" fill=\"#fff\" text-anchor=\"middle\">입</text><text x=\"220\" y=\"164\" font-family=\"Noto Sans CJK KR\" font-weight=\"800\" font-size=\"13.5\" fill=\"#D4728A\" text-anchor=\"middle\">\"눈 어디 있어요?\" 물으면 짚어요 (신체 부위)</text></svg></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "jointattn") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:14px 4px;text-align:center;\"><div style=\"display:inline-flex;align-items:center;gap:14px;\"><span style=\"font-size:60px;line-height:1;\">👉</span><span style=\"font-size:64px;line-height:1;\">⭐</span></div><div style=\"font-size:16px;font-weight:800;color:#D4728A;margin-top:14px;\">\"저기 봐!\" 가리키는 곳을 함께 봐요</div><div style=\"font-size:12.5px;color:#888;margin-top:4px;\">선생님이 가리키는 것을 아이도 같이 보기 (공동주의)</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "eyecontact") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:14px 4px;text-align:center;\"><div style=\"display:inline-flex;align-items:center;gap:10px;\"><span style=\"font-size:56px;line-height:1;\">👩‍🏫</span><span style=\"font-size:34px;line-height:1;\">👀</span><span style=\"font-size:56px;line-height:1;\">🧒</span></div><div style=\"font-size:16px;font-weight:800;color:#D4728A;margin-top:14px;\">\"나 봐!\" 눈을 마주 봐요</div><div style=\"font-size:12.5px;color:#888;margin-top:4px;\">선생님과 아이가 서로 눈을 보기 (눈맞춤)</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "imitate") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:8px 4px;\"><div style=\"display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#888;padding:0 6px 2px;\"><span>위: 선생님</span><span>아래: 아이가 따라해요</span></div><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"text-align:center;vertical-align:middle;width:33%;\"><div style=\"font-size:42px;line-height:1.15;\">🙌</div><div style=\"font-size:22px;color:#3FC66B;line-height:1;\">↓</div><div style=\"font-size:42px;line-height:1.15;\">🙌</div><div style=\"font-size:13px;font-weight:800;color:#3A2C30;margin-top:5px;\">만세!</div></td><td style=\"text-align:center;vertical-align:middle;width:33%;\"><div style=\"font-size:42px;line-height:1.15;\">🙆</div><div style=\"font-size:22px;color:#3FC66B;line-height:1;\">↓</div><div style=\"font-size:42px;line-height:1.15;\">🙆</div><div style=\"font-size:13px;font-weight:800;color:#3A2C30;margin-top:5px;\">머리 위 동그라미</div></td><td style=\"text-align:center;vertical-align:middle;width:33%;\"><div style=\"font-size:42px;line-height:1.15;\">✌️</div><div style=\"font-size:22px;color:#3FC66B;line-height:1;\">↓</div><div style=\"font-size:42px;line-height:1.15;\">✌️</div><div style=\"font-size:13px;font-weight:800;color:#3A2C30;margin-top:5px;\">브이!</div></td></tr></table><div style=\"text-align:center;font-size:13px;font-weight:800;color:#D4728A;margin-top:8px;\">선생님 동작을 똑같이 따라 해요 (동작 모방)</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "opposite") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:6px 2px;\"><div style=\"display:flex;align-items:center;background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:9px 14px;margin-bottom:8px;\"><div style=\"flex:1;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:34px;height:34px;border-radius:50%;background:#FF8A3D;vertical-align:middle;\"></span></div><div style=\"font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;\">커요</div></div><div style=\"flex:0 0 40px;text-align:center;font-size:22px;color:#F5A0B1;font-weight:900;\">↔</div><div style=\"flex:1;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:16px;height:16px;border-radius:50%;background:#FF8A3D;vertical-align:middle;\"></span></div><div style=\"font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;\">작아요</div></div></div><div style=\"display:flex;align-items:center;background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:9px 14px;margin-bottom:8px;\"><div style=\"flex:1;text-align:center;\"><div style=\"line-height:1;\"><span style=\"font-size:15px;letter-spacing:1px;color:#3FC66B;\">●●●●●●</span></div><div style=\"font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;\">많아요</div></div><div style=\"flex:0 0 40px;text-align:center;font-size:22px;color:#F5A0B1;font-weight:900;\">↔</div><div style=\"flex:1;text-align:center;\"><div style=\"line-height:1;\"><span style=\"font-size:15px;letter-spacing:1px;color:#3FC66B;\">●●</span></div><div style=\"font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;\">적어요</div></div></div><div style=\"display:flex;align-items:center;background:#fff;border:2px solid #F5A0B1;border-radius:14px;padding:9px 14px;margin-bottom:8px;\"><div style=\"flex:1;text-align:center;\"><div style=\"line-height:1;\"><span style=\"font-size:20px;\">🟣🟣</span></div><div style=\"font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;\">같아요</div></div><div style=\"flex:0 0 40px;text-align:center;font-size:22px;color:#F5A0B1;font-weight:900;\">↔</div><div style=\"flex:1;text-align:center;\"><div style=\"line-height:1;\"><span style=\"font-size:20px;\">🟣🟨</span></div><div style=\"font-size:14px;font-weight:800;color:#3A2C30;margin-top:4px;\">달라요</div></div></div><div style=\"text-align:center;font-size:12.5px;color:#888;margin-top:6px;\">반대되는 개념을 짝지어 배워요</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "sorting") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"padding:6px 2px;\"><div style=\"font-size:13px;font-weight:800;color:#D4728A;margin:0 0 2px 6px;\">색깔 맞추기</div><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"width:25%;padding:6px;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:36px;height:36px;border-radius:50%;background:#FF5A6E;\"></span></div><div style=\"font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;\">빨강</div></td><td style=\"width:25%;padding:6px;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:36px;height:36px;border-radius:50%;background:#3FA0FF;\"></span></div><div style=\"font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;\">파랑</div></td><td style=\"width:25%;padding:6px;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:36px;height:36px;border-radius:50%;background:#FFCB2E;\"></span></div><div style=\"font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;\">노랑</div></td><td style=\"width:25%;padding:6px;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:36px;height:36px;border-radius:50%;background:#3FC66B;\"></span></div><div style=\"font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;\">초록</div></td></tr></table><div style=\"font-size:13px;font-weight:800;color:#D4728A;margin:8px 0 2px 6px;\">모양 맞추기</div><table style=\"width:100%;border-collapse:collapse;table-layout:fixed;\"><tr><td style=\"width:25%;padding:6px;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:36px;height:36px;border-radius:50%;background:#FF9DBB;\"></span></div><div style=\"font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;\">동그라미</div></td><td style=\"width:25%;padding:6px;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:34px;height:34px;border-radius:7px;background:#8AC7FF;\"></span></div><div style=\"font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;\">네모</div></td><td style=\"width:25%;padding:6px;text-align:center;\"><div style=\"line-height:1;\"><span style=\"display:inline-block;width:0;height:0;border-left:19px solid transparent;border-right:19px solid transparent;border-bottom:34px solid #FFCB2E;\"></span></div><div style=\"font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;\">세모</div></td><td style=\"width:25%;padding:6px;text-align:center;\"><div style=\"line-height:1;\"><span style=\"font-size:38px;line-height:1;color:#3FC66B;\">★</span></div><div style=\"font-size:12px;font-weight:700;color:#3A2C30;margin-top:5px;\">별</div></td></tr></table><div style=\"text-align:center;font-size:12.5px;color:#888;margin-top:8px;\">같은 색·같은 모양끼리 모아요 (분류)</div></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "counting") {
    return (
      <CardFrame title={card.title}>
        <div dangerouslySetInnerHTML={{ __html: "<div style=\"text-align:center;\"><svg width=\"100%\" viewBox=\"0 0 440 220\" xmlns=\"http://www.w3.org/2000/svg\"><defs><filter id=\"sh\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feDropShadow dx=\"0\" dy=\"2\" stdDeviation=\"2\" flood-color=\"#D4728A\" flood-opacity=\"0.18\"/></filter></defs><circle cx=\"201\" cy=\"24\" r=\"16\" fill=\"#FF9DBB\" filter=\"url(#sh)\"/><text x=\"201\" y=\"30\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"17\" fill=\"#fff\" text-anchor=\"middle\">1</text><circle cx=\"245\" cy=\"24\" r=\"10\" fill=\"#FF5A6E\"/><circle cx=\"186\" cy=\"62\" r=\"16\" fill=\"#8AC7FF\" filter=\"url(#sh)\"/><text x=\"186\" y=\"68\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"17\" fill=\"#fff\" text-anchor=\"middle\">2</text><circle cx=\"230\" cy=\"62\" r=\"10\" fill=\"#3FA0FF\"/><circle cx=\"260\" cy=\"62\" r=\"10\" fill=\"#3FA0FF\"/><circle cx=\"171\" cy=\"100\" r=\"16\" fill=\"#FFD966\" filter=\"url(#sh)\"/><text x=\"171\" y=\"106\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"17\" fill=\"#fff\" text-anchor=\"middle\">3</text><circle cx=\"215\" cy=\"100\" r=\"10\" fill=\"#E0A800\"/><circle cx=\"245\" cy=\"100\" r=\"10\" fill=\"#E0A800\"/><circle cx=\"275\" cy=\"100\" r=\"10\" fill=\"#E0A800\"/><circle cx=\"156\" cy=\"138\" r=\"16\" fill=\"#7BE89B\" filter=\"url(#sh)\"/><text x=\"156\" y=\"144\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"17\" fill=\"#fff\" text-anchor=\"middle\">4</text><circle cx=\"200\" cy=\"138\" r=\"10\" fill=\"#3FC66B\"/><circle cx=\"230\" cy=\"138\" r=\"10\" fill=\"#3FC66B\"/><circle cx=\"260\" cy=\"138\" r=\"10\" fill=\"#3FC66B\"/><circle cx=\"290\" cy=\"138\" r=\"10\" fill=\"#3FC66B\"/><circle cx=\"141\" cy=\"176\" r=\"16\" fill=\"#C9AEFF\" filter=\"url(#sh)\"/><text x=\"141\" y=\"182\" font-family=\"Noto Sans CJK KR\" font-weight=\"900\" font-size=\"17\" fill=\"#fff\" text-anchor=\"middle\">5</text><circle cx=\"185\" cy=\"176\" r=\"10\" fill=\"#9B6BFF\"/><circle cx=\"215\" cy=\"176\" r=\"10\" fill=\"#9B6BFF\"/><circle cx=\"245\" cy=\"176\" r=\"10\" fill=\"#9B6BFF\"/><circle cx=\"275\" cy=\"176\" r=\"10\" fill=\"#9B6BFF\"/><circle cx=\"305\" cy=\"176\" r=\"10\" fill=\"#9B6BFF\"/><text x=\"220\" y=\"214\" font-family=\"Noto Sans CJK KR\" font-size=\"13\" fill=\"#5A5A66\" text-anchor=\"middle\">숫자만큼 하나씩 세어요 (1·2·3·4·5)</text></svg></div>" }} />
      </CardFrame>
    );
  }
  if (card.type === "compare") {
    // 대비 카드: 왼쪽(부정)/오른쪽(긍정)
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "flex", gap: 12 }}>
          {card.sides.map((s, i) => {
            const good = s.good;
            const col = good ? "#7BB07B" : "#E57A8A";
            const bg = good ? "#F2F9F2" : "#FDF2F4";
            return (
              <div key={i} style={{ flex: 1, borderRadius: 16, overflow: "hidden", border: `2px solid ${col}55`, background: bg }}>
                <div style={{ background: col, color: "#fff", fontSize: 13.5, fontWeight: 800, textAlign: "center", padding: "8px 4px" }}>{good ? "◯ " : "✕ "}{s.label}</div>
                <div style={{ padding: "14px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 34, marginBottom: 8, lineHeight: 1 }}>{s.emoji}</div>
                  <div style={{ fontSize: 12.5, color: "#5A4A4E", lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardFrame>
    );
  }
  if (card.type === "bigstep") {
    // 먼저-그다음 큰 카드
    const cols = ["#5B8BB5", "#7BB07B", "#C99A4B"];
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          {card.steps.map((s, i) => {
            const col = cols[i % cols.length];
            return (
              <React.Fragment key={i}>
                <div style={{ flex: 1, borderRadius: 14, overflow: "hidden", border: `2px solid ${col}`, background: "#fff", textAlign: "center", minWidth: 90 }}>
                  <div style={{ background: col, color: "#fff", fontSize: 13, fontWeight: 800, padding: "6px 4px" }}>{s.head}</div>
                  <div style={{ padding: "16px 8px" }}>
                    <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 8 }}>{s.emoji}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#3A2C30" }}>{s.label}</div>
                  </div>
                </div>
                {i < card.steps.length - 1 && <span style={{ fontSize: 26, color: "#D4728A", flexShrink: 0 }}>{"\u25B6"}</span>}
              </React.Fragment>
            );
          })}
        </div>
      </CardFrame>
    );
  }
  if (card.type === "photoslot") {
    // 사진 넣는 빈 칸 (arrow=false면 화살표 없이 선택지처럼 나란히)
    const showArrow = card.arrow !== false;
    const slotColors = [["#E8EDF7", "#9CB0DE"], ["#FBEAEE", "#E0A0B0"], ["#EAF5EC", "#9CCBA0"]];
    const photos = card.photos || [];
    return (
      <CardFrame title={card.title}>
        <div style={{ fontSize: 11.5, color: "#9A8A8F", marginBottom: 10, textAlign: "center" }}>
          {slotEditable ? "각 칸의 📷 를 눌러 사진을 넣으세요. (안 넣으면 인쇄 후 손으로 붙일 수 있어요)" : "빈 칸에 실제 사진을 인쇄해 붙이거나, 편집에서 사진을 넣으세요."}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
          {card.slots.map((s, i) => {
            const [bg, bd] = slotColors[i % slotColors.length];
            const photo = photos[i];
            return (
              <React.Fragment key={i}>
                <div style={{ flex: "0 0 auto", width: 110, textAlign: "center" }}>
                  <div style={{ position: "relative", width: 110, height: 110, borderRadius: 14, background: photo ? "#fff" : bg, border: `2px ${photo ? "solid" : "dashed"} ${bd}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#B0A0A8", fontSize: 26, overflow: "hidden" }}>
                    {photo
                      ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      : "📷"}
                    {slotEditable && (
                      <button onClick={() => onSlotPhoto(i)} title="사진 넣기"
                        style={{ position: "absolute", bottom: 4, right: 4, fontSize: 11, fontWeight: 700, background: "rgba(212,114,138,0.92)", color: "#fff", border: "none", borderRadius: 7, padding: "3px 8px", cursor: "pointer" }}>
                        {photo ? "변경" : "📷 넣기"}
                      </button>
                    )}
                    {slotEditable && photo && (
                      <button onClick={() => onSlotPhoto(i, true)} title="사진 빼기"
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#C56", color: "#fff", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
                    )}
                  </div>
                  {s ? <div style={{ fontSize: 15, fontWeight: 800, color: "#3A2C30", marginTop: 8 }}>{s}</div> : null}
                </div>
                {showArrow && i < card.slots.length - 1 && <span style={{ fontSize: 24, color: "#8A8A8A", flexShrink: 0 }}>{"\u2192"}</span>}
              </React.Fragment>
            );
          })}
        </div>
      </CardFrame>
    );
  }
  if (card.type === "team") {
    // 한 팀 다이어그램 (양쪽 인물 + 가운데 메시지)
    return (
      <CardFrame title={card.title}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <div style={{ textAlign: "center", flex: "0 0 auto" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#E8EDF7", border: "3px solid #9CB0DE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto" }}>{card.left.emoji}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#3A2C30", marginTop: 6 }}>{card.left.label}</div>
            {card.left.sub && <div style={{ fontSize: 11, color: "#9A8A8F" }}>{card.left.sub}</div>}
          </div>
          <div style={{ flex: 1, textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#C4557A", marginBottom: 4 }}>{card.center}</div>
            <div style={{ fontSize: 20, color: "#D4728A" }}>{"\u25C0\u2015\u25B6"}</div>
          </div>
          <div style={{ textAlign: "center", flex: "0 0 auto" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#FBEAEE", border: "3px solid #E0A0B0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto" }}>{card.right.emoji}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#3A2C30", marginTop: 6 }}>{card.right.label}</div>
            {card.right.sub && <div style={{ fontSize: 11, color: "#9A8A8F" }}>{card.right.sub}</div>}
          </div>
        </div>
      </CardFrame>
    );
  }
  return null;
}

// 편집 모드에서 카드 + 슬롯 사진 넣기를 감싸는 래퍼
function EditableVisualCard({ card, cardIndex, onRemove, onSlotPhoto }) {
  const fileRef = React.useRef(null);
  const pendingSlot = React.useRef(null);
  const [err, setErr] = useState("");
  const isPhotoslot = card.type === "photoslot";

  const handleSlot = (slotIdx, remove) => {
    if (remove) { onSlotPhoto(cardIndex, slotIdx, null); return; }
    pendingSlot.current = slotIdx;
    fileRef.current && fileRef.current.click();
  };
  const onFile = async (e) => {
    setErr("");
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 600, 0.7);
      onSlotPhoto(cardIndex, pendingSlot.current, dataUrl);
    } catch (er) { setErr("사진을 넣지 못했습니다: " + er.message); }
  };
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => onRemove(cardIndex)} title="이 카드 빼기"
        style={{ position: "absolute", top: 4, right: 4, zIndex: 3, width: 24, height: 24, borderRadius: "50%", border: "none", background: "#C56", color: "#fff", cursor: "pointer", fontSize: 14 }}>×</button>
      {isPhotoslot && <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />}
      <VisualCard card={card} slotEditable={isPhotoslot} onSlotPhoto={handleSlot} />
      {err && <div style={{ fontSize: 11, color: "#C04040", marginTop: 4 }}>{err}</div>}
    </div>
  );
}

// 카드 라이브러리에서 골라 추가하는 선택기
function CardPicker({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(CARD_CATEGORIES[0]);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ marginTop: 12, fontSize: 13, color: PKD, background: "#fff", border: `1.5px dashed ${PK}`, borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontWeight: 700, width: "100%" }}>
        + 카드 라이브러리에서 추가
      </button>
    );
  }
  const cards = CARD_LIBRARY.filter((c) => c.category === cat);
  return (
    <div style={{ marginTop: 12, border: `1.5px solid ${PKL}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: PKL }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: PKD }}>카드 추가</span>
        <button onClick={() => setOpen(false)} style={{ fontSize: 12, color: MUTE, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>닫기</button>
      </div>
      {/* 카테고리 탭 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 14px 4px" }}>
        {CARD_CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCat(c)}
            style={{ fontSize: 12, fontWeight: 700, padding: "5px 11px", borderRadius: 14, cursor: "pointer",
              border: `1.5px solid ${cat === c ? PKD : PKL}`, background: cat === c ? PKD : "#fff", color: cat === c ? "#fff" : MUTE }}>{c}</button>
        ))}
      </div>
      {/* 해당 카테고리 카드 목록 */}
      <div style={{ padding: 14, display: "grid", gap: 10, maxHeight: 340, overflowY: "auto" }}>
        {cards.map((card) => (
          <div key={card.id} style={{ position: "relative" }}>
            <VisualCard card={card} />
            <button onClick={() => onAdd({ ...card })}
              style={{ position: "absolute", top: 8, right: 8, zIndex: 2, fontSize: 12, fontWeight: 800, color: "#fff", background: "#5C9A72", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>+ 추가</button>
          </div>
        ))}
      </div>
    </div>
  );
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

// 편집 가능한 항목 리스트 (선행·대체·후속용)
function EditableList({ items, onChange, onAdd, onRemove }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <span style={{ color: PK, flexShrink: 0, fontWeight: 800, marginTop: 8 }}>·</span>
          <textarea value={t} onChange={(e) => onChange(i, e.target.value)} rows={Math.max(1, Math.ceil((t.length || 1) / 34))}
            style={{ flex: 1, fontSize: 13.5, lineHeight: 1.6, padding: "7px 9px", border: `1px solid ${PKL}`, borderRadius: 8, fontFamily: "inherit", color: INK, resize: "vertical" }} />
          <button onClick={() => onRemove(i)} title="삭제"
            style={{ flexShrink: 0, width: 26, height: 26, marginTop: 4, borderRadius: 6, border: `1px solid ${PKL}`, background: "#fff", color: "#C56", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button onClick={onAdd}
        style={{ justifySelf: "start", fontSize: 12, color: PKD, background: "#fff", border: `1px dashed ${PK}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700 }}>+ 항목 추가</button>
    </div>
  );
}

// 편집 가능한 텍스트 (가설·의미용)
function EditableText({ value, onChange }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={Math.max(2, Math.ceil((value.length || 1) / 40))}
      style={{ width: "100%", fontSize: 13.5, lineHeight: 1.7, padding: "9px 11px", border: `1px solid ${PKL}`, borderRadius: 8, fontFamily: "inherit", color: INK, resize: "vertical", boxSizing: "border-box" }} />
  );
}

// 사진 보기 (읽기 전용, 화면용)
function PhotoStrip({ photos }) {
  if (!photos || !photos.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      {photos.map((src, i) => (
        <img key={i} src={src} alt={`설명 사진 ${i + 1}`}
          style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10, border: `1px solid ${PKL}` }} />
      ))}
    </div>
  );
}

// 사진 편집 (업로드/삭제)
function PhotoEditor({ photos, onAdd, onRemove }) {
  const inputRef = React.useRef(null);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: photos.length ? 8 : 0 }}>
        {photos.map((src, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={src} alt={`사진 ${i + 1}`} style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 10, border: `1px solid ${PKL}` }} />
            <button onClick={() => onRemove(i)} title="삭제"
              style={{ position: "absolute", top: -7, right: -7, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#C56", color: "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
      <button onClick={() => inputRef.current && inputRef.current.click()}
        style={{ fontSize: 12, color: PKD, background: "#fff", border: `1px dashed ${PK}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700 }}>📷 사진 추가</button>
    </div>
  );
}

// 부모님용 쉬운 뷰
function ParentView({ content, childName, visualCards, draftVisualCards, onRemoveCard, onAddCard, onSlotPhoto, editing, draft, photos, onField, onItem, onAddItem, onRemoveItem, onAddPhotos, onRemovePhoto }) {
  const nm = displayName(childName);
  const ph = photos || { prevent: [], teach: [], respond: [] };
  const Block = ({ title, desc, items, bg, accent, secKey }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: accent }}>{title}</span>
      </div>
      {/* 설명형(why) */}
      {desc !== undefined ? (
        editing
          ? <textarea value={draft.why} onChange={(e) => onField("why", e.target.value)} rows={Math.max(2, Math.ceil((draft.why.length || 1) / 34))}
              style={{ width: "100%", fontSize: 13.5, lineHeight: 1.8, padding: "12px 14px", border: `1px solid ${accent}55`, borderRadius: 12, fontFamily: "inherit", color: INK, resize: "vertical", boxSizing: "border-box", background: bg }} />
          : <div style={{ fontSize: 13.5, lineHeight: 1.8, color: INK, background: bg, borderRadius: 12, padding: "14px 16px" }}>{desc}</div>
      ) : null}
      {/* 목록형(prevent/teach/respond) */}
      {items !== undefined ? (
        editing ? (
          <div style={{ display: "grid", gap: 8 }}>
            {draft[secKey].map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, color: accent, fontWeight: 800, marginTop: 9 }}>{i + 1}</span>
                <textarea value={t} onChange={(e) => onItem(secKey, i, e.target.value)} rows={Math.max(1, Math.ceil((t.length || 1) / 30))}
                  style={{ flex: 1, fontSize: 13.5, lineHeight: 1.7, padding: "9px 11px", border: `1px solid ${accent}55`, borderRadius: 10, fontFamily: "inherit", color: INK, resize: "vertical", background: bg }} />
                <button onClick={() => onRemoveItem(secKey, i)} title="삭제"
                  style={{ flexShrink: 0, width: 26, height: 26, marginTop: 5, borderRadius: 6, border: `1px solid ${accent}55`, background: "#fff", color: "#C56", cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            ))}
            <button onClick={() => onAddItem(secKey)}
              style={{ justifySelf: "start", fontSize: 12, color: accent, background: "#fff", border: `1px dashed ${accent}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700 }}>+ 항목 추가</button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.7, background: bg, borderRadius: 12, padding: "12px 14px" }}>
                <span style={{ flexShrink: 0, color: accent, fontWeight: 800 }}>{i + 1}</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        )
      ) : null}
      {/* 사진 (설명형 블록엔 사진 없음: secKey 있을 때만) */}
      {secKey ? (
        editing ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: draft.photos[secKey].length ? 8 : 0 }}>
              {draft.photos[secKey].map((src, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={src} alt={`사진 ${i + 1}`} style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 10, border: `1px solid ${accent}55` }} />
                  <button onClick={() => onRemovePhoto(secKey, i)} style={{ position: "absolute", top: -7, right: -7, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#C56", color: "#fff", cursor: "pointer", fontSize: 13 }}>×</button>
                </div>
              ))}
            </div>
            <PhotoPickBtn accent={accent} onPick={(fl) => onAddPhotos(secKey, fl)} />
          </div>
        ) : (
          (ph[secKey] && ph[secKey].length) ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {ph[secKey].map((src, i) => <img key={i} src={src} alt={`사진 ${i + 1}`} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10, border: `1px solid ${accent}44` }} />)}
            </div>
          ) : null
        )
      ) : null}
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 16, lineHeight: 1.6, background: "#FFF9FA", borderRadius: 10, padding: "10px 12px" }}>
        이 내용은 <b>{nm} 부모님</b>을 위해 쉽게 풀어 쓴 가정 지원 안내입니다. 집에서 이렇게 도와주시면 큰 힘이 됩니다.
      </div>
      <Block title={`${nm}는 왜 이런 행동을 할까요?`} desc={content.why} bg="#FFF0F3" accent={PKD} />
      <Block title="미리 예방해요 (이렇게 해보세요)" items={content.prevent} bg="#F0F7F1" accent="#5C9A72" secKey="prevent" />
      <Block title="다른 행동을 가르쳐요" items={content.teach} bg="#EEF3FB" accent="#5B7BB5" secKey="teach" />
      <Block title="이렇게 반응해주세요" items={content.respond} bg="#FFF6EC" accent="#C99A4B" secKey="respond" />
      {(() => {
        const cards = editing ? (draftVisualCards || []) : (visualCards || []);
        if (!cards.length && !editing) return null;
        return (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px dashed ${PKL}` }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: PKD, marginBottom: 4 }}>집에서 함께 쓰는 자료</div>
            <div style={{ fontSize: 12, color: MUTE, marginBottom: 14 }}>
              {editing ? "필요없는 카드는 × 버튼으로 뺄 수 있어요." : "아래 카드를 출력해서 아이와 함께 사용해 보세요."}
            </div>
            {cards.map((card, i) => (
              editing
                ? <EditableVisualCard key={i} card={card} cardIndex={i} onRemove={onRemoveCard} onSlotPhoto={onSlotPhoto} />
                : <VisualCard key={i} card={card} />
            ))}
            {editing && <CardPicker onAdd={onAddCard} />}
          </div>
        );
      })()}
    </div>
  );
}

// 사진 선택 버튼 (파일 input 래퍼)
function PhotoPickBtn({ accent, onPick }) {
  const ref = React.useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
      <button onClick={() => ref.current && ref.current.click()}
        style={{ fontSize: 12, color: accent, background: "#fff", border: `1px dashed ${accent}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700 }}>📷 사진 추가</button>
    </>
  );
}

// AI 맞춤 추가 항목 (보라색 🤖 표시)


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
    bip._meaning != null ? bip._meaning : FUNC_MEANING(bip.func, c.name, c.target, bip.setting),
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
  const [likes, setLikes] = useState("");        // 좋아하는 것(강화제)
  const [comm, setComm] = useState("");           // 의사소통 수준
  const [behaviorDetail, setBehaviorDetail] = useState(""); // 행동의 구체적 모습
  const [triggers, setTriggers] = useState("");   // 심해지는·진정되는 상황

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
    // 센터: 생년월일 기반 자동 나이 / PBS: 입력한 학년(없으면 자동 나이)
    const ageValue = isPbs ? (age.trim() || autoAge) : autoAge;
    onAdd({ name: name.trim(), birth, age: ageValue, target: target.trim(), likes: likes.trim(), comm: comm.trim(), behaviorDetail: behaviorDetail.trim(), triggers: triggers.trim(), ...(isPbs ? { school: school.trim() } : {}) });
  };

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 4px 20px rgba(212,114,138,0.1)", border: `1.5px solid ${PKL}` }}>
      <div style={{ fontWeight: 700, marginBottom: 14, color: PKD }}>새 케이스 추가</div>
      <Field label="아동 이름" value={name} onChange={setName} placeholder="예: 김○○" />
      <Field label="생년월일" value={birth} onChange={setBirth} type="date" />
      {isPbs && <Field label="학년" value={age} onChange={setAge} placeholder="예: 고1" />}
      {isPbs && <Field label="학교" value={school} onChange={setSchool} placeholder="예: 인천영종고" />}
      <Field label="목표행동" value={target} onChange={setTarget} placeholder="예: 수업 중 자리 이탈" />

      <div style={{ marginTop: 6, marginBottom: 4, padding: "10px 12px", background: "#FBF8FE", border: "1px dashed #D9C9F0", borderRadius: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#8A6FB0", marginBottom: 2 }}>✨ AI 맞춤 생성용 정보 (선택)</div>
        <div style={{ fontSize: 11, color: MUTE, lineHeight: 1.5, marginBottom: 10 }}>아래를 채우면 AI가 이 아이에 훨씬 맞는 BIP를 만들어요. 비워둬도 됩니다.</div>
        <Field label="좋아하는 것 (강화제)" value={likes} onChange={setLikes} placeholder="예: 자동차 장난감, 유튜브, 젤리, 안아주기" />
        <Field label="의사소통 수준" value={comm} onChange={setComm} placeholder="예: 2~3단어 구어 / 그림카드 사용 / 무발화" />
        <Field label="행동의 구체적 모습" value={behaviorDetail} onChange={setBehaviorDetail} placeholder="예: 10분쯤 앉아있다 일어나 커튼을 만지작거림" />
        <Field label="심해지는 · 진정되는 상황" value={triggers} onChange={setTriggers} placeholder="예: 조용한 시간에 심해짐 / 안아주면 진정됨" />
      </div>

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

function Field({ label, value, onChange, placeholder, type = "text", onEnter, autoComplete }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <input type={type} value={value} placeholder={placeholder}
        autoComplete={autoComplete}
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

// 이미지 파일 → 리사이즈(가로 최대 maxW) + JPEG 압축 → base64 dataURL
function compressImage(file, maxW = 800, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) { reject(new Error("이미지 파일이 아닙니다.")); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // 투명 png 대비 흰 배경
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

// "2026-07-08" → "2026. 7. 8." (빈값이면 빈 문자열)
function isoToKr(iso) {
  if (!iso) return "";
  const m = String(iso).split("-");
  if (m.length !== 3) return iso;
  return `${Number(m[0])}. ${Number(m[1])}. ${Number(m[2])}.`;
}

function nowLocal() {
  const d = new Date();
  const mm = d.getMonth() + 1, dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0"), mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}월 ${dd}일 ${hh}:${mi}`;
}
