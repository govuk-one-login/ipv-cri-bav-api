/* eslint-disable max-lines-per-function */
import { sessionPost, stubStartPost } from "../ApiTestSteps";
import { sleep } from "../../../../src/utils/Sleep";
import { describeAlarm } from "../ApiUtils";


describe("BAV CRI Alarms Tests", () => {

    it("/session Endpoint 4xx Api Gateway Alarm", async () => {
        for (let i = 1; i <= 100; i++) {
            const stubResponse = await stubStartPost();
            await sessionPost("", stubResponse.data.request);
        }
        await sleep(300000);

        const alarm = await describeAlarm("bav-cri-api-Session4XXApiGwErrorAlarm");
        console.log("Session Endpoint Alarm State: " + alarm.StateValue);
	}, 450000);

});
