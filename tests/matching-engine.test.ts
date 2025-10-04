import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_SUBJECT = 101;
const ERR_INVALID_LEVEL = 102;
const ERR_INVALID_AVAILABILITY = 103;
const ERR_INVALID_LOCATION = 104;
const ERR_INVALID_REPUTATION = 105;
const ERR_REQUEST_ALREADY_MATCHED = 106;
const ERR_NO_MATCHES_FOUND = 107;
const ERR_INVALID_TIMESTAMP = 108;
const ERR_INVALID_PROPOSAL = 109;
const ERR_PROPOSAL_EXPIRED = 110;
const ERR_INVALID_MATCH_CRITERIA = 111;
const ERR_MAX_PROPOSALS_EXCEEDED = 112;
const ERR_INVALID_USER = 113;
const ERR_INVALID_TUTOR = 114;
const ERR_INVALID_STUDENT = 115;
const ERR_MATCH_ALREADY_EXISTS = 116;
const ERR_INVALID_DISTANCE = 117;
const ERR_INVALID_RATING = 118;
const ERR_INVALID_STATUS = 119;
const ERR_AUTHORITY_NOT_SET = 120;

interface Proposal {
  tutor: string;
  score: number;
  timestamp: number;
}

interface Match {
  requestId: number;
  tutor: string;
  student: string;
  subject: string;
  level: number;
  timestamp: number;
  status: boolean;
}

interface RequestStatus {
  matched: boolean;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MatchingEngineMock {
  state: {
    nextMatchId: number;
    maxProposalsPerRequest: number;
    proposalExpiry: number;
    authorityContract: string | null;
    matchProposals: Map<number, Proposal[]>;
    activeMatches: Map<number, Match>;
    requestStatus: Map<number, RequestStatus>;
  } = {
    nextMatchId: 0,
    maxProposalsPerRequest: 10,
    proposalExpiry: 144,
    authorityContract: null,
    matchProposals: new Map(),
    activeMatches: new Map(),
    requestStatus: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextMatchId: 0,
      maxProposalsPerRequest: 10,
      proposalExpiry: 144,
      authorityContract: null,
      matchProposals: new Map(),
      activeMatches: new Map(),
      requestStatus: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === this.caller) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxProposals(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.state.maxProposalsPerRequest = newMax;
    return { ok: true, value: true };
  }

  setProposalExpiry(newExpiry: number): Result<boolean> {
    if (newExpiry <= 0) return { ok: false, value: ERR_INVALID_PROPOSAL };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.state.proposalExpiry = newExpiry;
    return { ok: true, value: true };
  }

  proposeMatch(requestId: number, tutor: string, score: number, subject: string, level: number): Result<boolean> {
    if (!this.state.requestStatus.has(requestId)) return { ok: false, value: ERR_INVALID_MATCH_CRITERIA };
    const status = this.state.requestStatus.get(requestId)!;
    if (status.matched) return { ok: false, value: ERR_REQUEST_ALREADY_MATCHED };
    if (!subject || subject.length > 50) return { ok: false, value: ERR_INVALID_SUBJECT };
    if (level < 1 || level > 12) return { ok: false, value: ERR_INVALID_LEVEL };
    if (score < 50) return { ok: false, value: ERR_INVALID_REPUTATION };
    let proposals = this.state.matchProposals.get(requestId) || [];
    if (proposals.length >= this.state.maxProposalsPerRequest) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    proposals.push({ tutor, score, timestamp: this.blockHeight });
    this.state.matchProposals.set(requestId, proposals);
    return { ok: true, value: true };
  }

  acceptMatch(requestId: number, tutor: string, student: string, subject: string, level: number): Result<number> {
    if (!this.state.matchProposals.has(requestId)) return { ok: false, value: ERR_NO_MATCHES_FOUND };
    if (!this.state.requestStatus.has(requestId)) return { ok: false, value: ERR_INVALID_MATCH_CRITERIA };
    const status = this.state.requestStatus.get(requestId)!;
    if (status.matched) return { ok: false, value: ERR_REQUEST_ALREADY_MATCHED };
    const proposals = this.state.matchProposals.get(requestId)!;
    if (!proposals.some(p => p.tutor === tutor)) return { ok: false, value: ERR_INVALID_PROPOSAL };
    if (!subject || subject.length > 50) return { ok: false, value: ERR_INVALID_SUBJECT };
    if (level < 1 || level > 12) return { ok: false, value: ERR_INVALID_LEVEL };
    const matchId = this.state.nextMatchId;
    this.state.activeMatches.set(matchId, { requestId, tutor, student, subject, level, timestamp: this.blockHeight, status: true });
    this.state.requestStatus.set(requestId, { matched: true, timestamp: this.blockHeight });
    this.state.nextMatchId++;
    return { ok: true, value: matchId };
  }

  getBestMatch(requestId: number): { tutor: string | null; score: number } {
    const proposals = this.state.matchProposals.get(requestId) || [];
    return proposals.reduce((best, p) => p.score > best.score ? { tutor: p.tutor, score: p.score } : best, { tutor: null, score: 0 });
  }

  expireProposals(requestId: number): Result<boolean> {
    let proposals = this.state.matchProposals.get(requestId) || [];
    proposals = proposals.filter(p => this.blockHeight - p.timestamp < this.state.proposalExpiry);
    this.state.matchProposals.set(requestId, proposals);
    return { ok: true, value: true };
  }

  getMatchCount(): Result<number> {
    return { ok: true, value: this.state.nextMatchId };
  }
}

describe("MatchingEngine", () => {
  let contract: MatchingEngineMock;

  beforeEach(() => {
    contract = new MatchingEngineMock();
    contract.reset();
    contract.state.requestStatus.set(0, { matched: false, timestamp: 0 });
  });

  it("proposes a match successfully", () => {
    const result = contract.proposeMatch(0, "ST2TUTOR", 80, "Math", 5);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposals = contract.state.matchProposals.get(0);
    expect(proposals?.length).toBe(1);
    expect(proposals?.[0].tutor).toBe("ST2TUTOR");
    expect(proposals?.[0].score).toBe(80);
  });

  it("rejects proposal for matched request", () => {
    contract.state.requestStatus.set(0, { matched: true, timestamp: 0 });
    const result = contract.proposeMatch(0, "ST2TUTOR", 80, "Math", 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_REQUEST_ALREADY_MATCHED);
  });

  it("rejects invalid subject", () => {
    const result = contract.proposeMatch(0, "ST2TUTOR", 80, "", 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SUBJECT);
  });

  it("rejects invalid level", () => {
    const result = contract.proposeMatch(0, "ST2TUTOR", 80, "Math", 13);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LEVEL);
  });

  it("rejects low reputation", () => {
    const result = contract.proposeMatch(0, "ST2TUTOR", 40, "Math", 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REPUTATION);
  });

  it("rejects when max proposals exceeded", () => {
    for (let i = 0; i < 10; i++) {
      contract.proposeMatch(0, `ST${i}TUTOR`, 80 + i, "Math", 5);
    }
    const result = contract.proposeMatch(0, "ST10TUTOR", 90, "Math", 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PROPOSALS_EXCEEDED);
  });

  it("accepts a match successfully", () => {
    contract.proposeMatch(0, "ST2TUTOR", 80, "Math", 5);
    const result = contract.acceptMatch(0, "ST2TUTOR", "ST3STUDENT", "Math", 5);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const match = contract.state.activeMatches.get(0);
    expect(match?.tutor).toBe("ST2TUTOR");
    expect(match?.student).toBe("ST3STUDENT");
    expect(match?.subject).toBe("Math");
    expect(match?.level).toBe(5);
    const status = contract.state.requestStatus.get(0);
    expect(status?.matched).toBe(true);
  });

  it("rejects accept for no proposals", () => {
    const result = contract.acceptMatch(0, "ST2TUTOR", "ST3STUDENT", "Math", 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NO_MATCHES_FOUND);
  });

  it("rejects accept for invalid proposal", () => {
    contract.proposeMatch(0, "ST2TUTOR", 80, "Math", 5);
    const result = contract.acceptMatch(0, "ST4INVALID", "ST3STUDENT", "Math", 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSAL);
  });

  it("gets best match correctly", () => {
    contract.proposeMatch(0, "ST2TUTOR", 80, "Math", 5);
    contract.proposeMatch(0, "ST3TUTOR", 90, "Math", 5);
    contract.proposeMatch(0, "ST4TUTOR", 70, "Math", 5);
    const best = contract.getBestMatch(0);
    expect(best.tutor).toBe("ST3TUTOR");
    expect(best.score).toBe(90);
  });

  it("sets max proposals successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setMaxProposals(15);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxProposalsPerRequest).toBe(15);
  });

  it("rejects set max proposals without authority", () => {
    const result = contract.setMaxProposals(15);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("sets proposal expiry successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setProposalExpiry(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.proposalExpiry).toBe(200);
  });

  it("rejects set proposal expiry without authority", () => {
    const result = contract.setProposalExpiry(200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("gets match count correctly", () => {
    contract.proposeMatch(0, "ST2TUTOR", 80, "Math", 5);
    contract.acceptMatch(0, "ST2TUTOR", "ST3STUDENT", "Math", 5);
    const result = contract.getMatchCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });
});