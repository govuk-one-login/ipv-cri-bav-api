import { LambdaInterface } from "@aws-lambda-powertools/commons";
class Session implements LambdaInterface {
	handler(): void {
		console.log("placeholder handler");
	}
}

const handlerClass = new Session();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
