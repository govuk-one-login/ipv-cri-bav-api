import { ISessionItem } from "../../models/ISessionItem";

export function getVariable(sessionItem: ISessionItem | undefined, variableName: string): any {
    switch (variableName) {
        case "authSessionState":
            return sessionItem?.authSessionState;
        default:
            return null;
    }
}

/*
    sessionId: string;
	clientId: string;
	clientSessionId: string;
	authorizationCode?: string;
	authorizationCodeExpiryDate?: number;
	redirectUri: string;
	accessToken?: string;
	accessTokenExpiryDate?: number;
	expiryDate: number;
	createdDate: number;
	state: string;
	subject: string;
	persistentSessionId: string;
	clientIpAddress: string;
	attemptCount: number;
	evidence_requested?: EvidenceRequested;
*/