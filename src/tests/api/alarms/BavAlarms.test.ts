/* eslint-disable max-lines-per-function */
import { abortPost, authorizationGet, personInfoGet, sessionPost, startStubServiceAndReturnSessionId, stubStartPost, tokenPost, userInfoPost, verifyAccountPost } from "../ApiTestSteps";
import { sleep } from "../../../../src/utils/Sleep";
import { describeAlarm } from "../ApiUtils";
import verifyAccountYesPayload from "../../data/bankDetailsYes.json";
import { BankDetailsPayload } from "../../models/BankDetailsPayload";
import { randomUUID } from "crypto";

describe("BAV CRI Alarms Tests", () => {

	it("/session Endpoint 4xx Api Gateway Alarm", async () => {
		for (let i = 1; i <= 250; i++) {
			const stubResponse = await stubStartPost();
			await sessionPost("", stubResponse.data.request);
		}
		await sleep(300000);
		await expect(describeAlarm("bav-cri-api-Session4XXApiGwErrorAlarm")).resolves.toBe("ALARM");

	}, 450000);

	it("/verify-account Endpoint 4xx Api Gateway Alarm", async () => {
		const sessionId = await startStubServiceAndReturnSessionId();
		const bankDetails = new BankDetailsPayload("204578", "444444444");
		for (let i = 1; i <= 200; i++) {
			await verifyAccountPost(bankDetails, sessionId);
		}
		await sleep(300000);

		await expect(describeAlarm("bav-cri-api-VerifyAccount4XXApiGwErrorAlarm")).resolves.toBe("ALARM");
	}, 450000);

	it("/authorization Endpoint 4xx Api Gateway Alarm", async () => {
		for (let i = 1; i <= 250; i++) {
			await authorizationGet(randomUUID());
		}
		await sleep(300000);

		await expect(describeAlarm("bav-cri-api-Authorization4XXApiGwErrorAlarm")).resolves.toBe("ALARM");
	}, 450000);

	it("/token Endpoint 4xx Api Gateway Alarm", async () => {
		const sessionId = await startStubServiceAndReturnSessionId();
		const bankDetails = new BankDetailsPayload(verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number);
		await verifyAccountPost(new BankDetailsPayload(
			verifyAccountYesPayload.sort_code, verifyAccountYesPayload.account_number), sessionId,
		);
		const authResponse = await authorizationGet(sessionId);
		const authCode = randomUUID();
		for (let i = 1; i <= 250; i++) {
			await tokenPost(authCode, authResponse.data.redirect_uri);
		}
		await sleep(300000);

		await expect(describeAlarm("bav-cri-api-Token4XXApiGwErrorAlarm")).resolves.toBe("ALARM");
	}, 450000);

	it("/userInfo Endpoint 4xx Api Gateway Alarm", async () => {
		for (let i = 1; i <= 250; i++) {
			await userInfoPost("Bearer");
		}
		await sleep(300000);

		await expect(describeAlarm("bav-cri-api-UserInfo4XXApiGwErrorAlarm")).resolves.toBe("ALARM");
	}, 450000);

	it("/abort Endpoint 4xx Api Gateway Alarm", async () => {
		for (let i = 1; i <= 250; i++) {
			await abortPost(randomUUID());
		}
		await sleep(300000);

		await expect(describeAlarm("bav-cri-api-Abort4XXApiGwErrorAlarm")).resolves.toBe("ALARM");
	}, 450000);

	it("/personInfo Endpoint 4xx Api Gateway Alarm", async () => {
		for (let i = 1; i <= 250; i++) {
			await personInfoGet(randomUUID());
		}
		await sleep(300000);

		await expect(describeAlarm("bav-cri-api-PersonInfo4XXApiGwErrorAlarm")).resolves.toBe("ALARM");
	}, 450000);

});
