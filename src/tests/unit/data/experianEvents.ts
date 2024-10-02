export const experianVerifyResponse = {
        "responseHeader": {
          "requestType": "BAVConsumer-Standard",
          "clientReferenceId": "${context.request.body:$.header.clientReferenceId}",
          "expRequestId": "RB0000${random.numeric(length=8)}",
          "messageTime": "2022-05-19T16:01:53Z",
          "overallResponse": {
              "decision": "CONTINUE",
              "decisionText": "Continue",
              "decisionReasons": [
                  "Valid bank account details",
                  "Processing completed successfully",
                  "Bank Account Verification - Consumer check resulted in a Continue decision"
              ],
          "recommendedNextActions": [],
          "spareObjects": []
          },
          "responseCode": "${stores.responseDetail.responseCode}",
          "responseType": "${stores.responseDetail.responseType}",
          "responseMessage": "${stores.responseDetail.responseMessage}",
          "tenantID": "${context.request.body:$.header.tenantId}"
        },
        "clientResponsePayload": {
        "orchestrationDecisions": [
          {
            "sequenceId": "1",
            "decisionSource": "BWValidation",
            "decision": "CONTINUE",
            "decisionReasons": [
                  "Valid bank account details"
            ],
            "score": 0,
            "decisionText": "CONTINUE",
            "nextAction": "Continue",
            "decisionTime": "2023-06-15T13:27:37Z"
          },
          {
            "sequenceId": "2",
            "decisionSource": "uk-crp",
            "decision": "CONTINUE",
            "decisionReasons": [
                  "Processing completed successfully"
            ],
            "score": 0,
            "decisionText": "Continue",
            "nextAction": "Continue",
            "decisionTime": "2023-06-15T13:27:37Z"
          },
          {
            "sequenceId": "3",
            "decisionSource": "Bank Account Verification",
            "decision": "CONTINUE",
            "decisionReasons": [
                  "Bank Account Verification - Consumer check resulted in a Continue decision"
            ],
            "score": 0,
            "decisionText": "CONTINUE",
            "nextAction": "Continue",
            "decisionTime": "2023-06-15T13:27:37Z"
          }
        ],
        "decisionElements": [
          {
            "serviceName": "Bankaccountvalidation",
            "applicantId": "APPLICANT_1",
            "warningsErrors": [],
            "otherData": {
              "branchData": [
                {
                  "institutionName": "070116 Short Name",
                  "branchName": "070116 Branch title - Absolute Test sortcode",
                  "address": [
                    {
                      "1": "070116 Address 1",
                      "2": "070116 Address 2",
                      "3": "070116 Address 3",
                      "4": "070116 Town",
                      "5": "070116 County"
                    }
                  ],
                  "telephoneNumber": "67 070116 070116",
                  "subBranchNumber": 0
                }
              ]
            },
            "decisions": [
              {
                "element": "BBAN1",
                "value": "070116"
              },
              {
                "element": "BBAN2",
                "value": "99990086"
              }
            ]
          },
          {
            "serviceName": "uk-crpverify",
            "applicantId": "APPLICANT_1",
            "appReference": "7FMQKTN22D",
            "warningsErrors": [],
            "otherData": {
              "response": {
                "contactId": "MainContact_1",
                "nameId": "MAINPERSONNAME_1",
                "uuid": "fb86ab09-af0a-410d-98b9-0fa5ecdbf707"
              }
            },
            "auditLogs": [
              {
                "eventType": "CONSUMER BANK ACCOUNT",
                "eventDate": "2023-06-15T13:27:37Z",
                "eventOutcome": "Match Found"
              }
            ]
          },
          {
            "serviceName": "uk-bavconsumer",
            "applicantId": "APPLICANT_1",
            "score": 0,
            "appReference": "7FMQKTN22D",
            "rules": [
              {
                "ruleId": "CNS1004",
                "ruleName": "BAV_Acc_Age_0_30_Days",
                "ruleScore": 0,
                "ruleText": "Data has been found to indicate that the account was opened in the last 30 days"
              },
              {
                "ruleId": "CNS1005",
                "ruleName": "BAV_Acc_Age_30_60_Days",
                "ruleScore": 0,
                "ruleText": "Data has been found to indicate that the account was opened in the past 30-60 days"
              },
              {
                "ruleId": "CNS1001",
                "ruleName": "BAV_Acc_Holder_Deceased",
                "ruleScore": 0,
                "ruleText": "Data has been found to indicate that the account holder is deceased"
              },
              {
                "ruleId": "CNS1002",
                "ruleName": "BAV_Account_Closed",
                "ruleScore": 0,
                "ruleText": "Data has been found to indicate that the account is closed"
              },
              {
                "ruleId": "CNS1018",
                "ruleName": "BAV_OA_GE90D_PDSGE7_ASGE6",
                "ruleScore": 1,
                "ruleText": "Match to an open account, aged >=90 days, Personal Details Score >=7 and Address Score >=6"
              },
              {
                "ruleId": "CNS1019",
                "ruleName": "BAV_OA_GE90D_PDSGE5_ASGE4",
                "ruleScore": 1,
                "ruleText": "Match found to an open account which was opened 90 or more days ago with Personal Details Score >= 5 and Address Score >= 4"
              },
              {
                "ruleId": "CNS1020",
                "ruleName": "BAV_OA_PDSGE5_ASGE4",
                "ruleScore": 1,
                "ruleText": "Match to an open account, aged >=90 days, Personal Details Score >=5 and Address Score >=4"
              },
              {
                "ruleId": "CNS1021",
                "ruleName": "BAV_OA_GE90D_PDSGE7",
                "ruleScore": 0,
                "ruleText": "Match to an open account, aged >=90 days, Personal Details Score >=7"
              },
              {
                "ruleId": "CNS1022",
                "ruleName": "BAV_OA_GE90D_PDSGE5",
                "ruleScore": 1,
                "ruleText": "Match to an open account, aged >=90 days, Personal Details Score >=5"
              },
              {
                "ruleId": "CNS1016",
                "ruleName": "BAV_Unable_to_Check_Not_Consented_Provider",
                "ruleScore": 0,
                "ruleText": "The supplied sort code belongs to a provider that has not consented for their data to be used by this service"
              },
              {
                "ruleId": "9990",
                "ruleName": "NRF9990",
                "ruleScore": 0,
                "ruleText": "No other rule has fired"
              }
            ],
            "matches": [
              {
                "name": "Joint Account",
                "value": "No Match"
              },
              {
                "name": "Sole Account",
                "value": "Match"
              }
            ],
            "dataCounts": [
              {
                "name": "AccountAgeThirtySixMonthsPlus",
                "value": 1
              },
              {
                "name": "BAV_ConsentedDataFound",
                "value": 1
              },
              {
                "name": "AccountAgeNinetyOrMoreDays",
                "value": 1
              }
            ],
            "scores": [
              {
                "name": "Personal details",
                "score": 9
              }
            ]
          }
        ]
      },
      "originalRequestData": {
        "application": {
          "applicants": [
            {
              "id": "APPLICANT_1",
              "contactId": "MainContact_1"
            }
          ]
        },
        "source": "WEB",
        "contacts": [
          {
            "id": "MainContact_1",
            "person": {
              "typeOfPerson": "APPLICANT",
              "personDetails": {
                "dateOfBirth": "${context.request.body:$.payload.contacts[0].person.personDetails.dateOfBirth}"
              },
              "names": [
                {
                  "id": "MAINPERSONNAME_1",
                  "type": "CURRENT",
                  "firstName": "${context.request.body:$.payload.contacts[0].person.names[0].firstName}",
                  "middleNames": "",
                  "surName": "${context.request.body:$.payload.contacts[0].person.names[0].surName}"
                }
              ]
            },
            "bankAccount": {
              "sortCode": "90987683",
              "accountNumber": "485967"
            }
          }
        ]
       }
      }
