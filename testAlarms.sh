#!/bin/bash

# # Loop for Command 1
# for i in {1..50}; do
#     curl --location 'https://api.review-bav.build.account.gov.uk/verify-account' \
#     --header 'x-govuk-signin-session-id: e6a71dfc-0053-49e3-a046-d295f59f593b' \
#     --header 'Content-Type: application/json' \
#     --data '{
#         "account_number": "66666666",
#         "sort_code": "204578"
#     }'
# done

# Loop for Command 2
for i in {1..100}; do
    curl --location 'https://api.review-bav.build.account.gov.uk/session' \
    --header 'Content-Type: application/json' \
    --data '{
        "client_id": "",
        "request": "eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.FxDUkAK6klkHO8zUFVHYY1odDBJAUAvAwo6hvqCbB8FZtQaOrN0bxq5GWrAqzGdUtESEOh4_0nb9veSAiTsDUaXRw58GYM8EimrfNJwGRT2VjNIXiy0-hFW_GkdM3J0sBcvklO2pCPC6pxk39HZfANCLC9boq6bxg5Ar5LUDmxOOaMPfD9ne9AHFM_IKal837BNFI3EL0BxrcskLcqDa9XhJeFDh8oJsK3-55YFz2ml3QEkgqMJ5OZyjdjOrhmLERO752lrXHc9maj9Uq6O87FyXgGGVpMqf3muyNYSbzJFCkIPUqLMmg6aWrCRlY-V8ABEf16JDglaoSunRGT6GGg.715q1_JmNlPCNThQ.1INtlNMB5bFVS5snOLDOoBxYQi6wnDTeCi0H81AsfcbugqQp3pK5Thoq0baE1e9HwF8x1g5-BUjEv6uzH1Vjo1I2DFKo-2JbqKgqAL3J6Z4j3bxr0yAHAvYe8BoAwOHqewbJ1-I3xtVlE_UdKrJZj-W_rAt6dTQ7cR8Ow188reI30asLU-ixW8hThGXTZGFBSvAfx_aWyWoqG_NW5neVmybnNxLda2vkKzwu_KFKUvrDl5tvuKvJ5AKnQnZI4F2moOqGRAjLlidPlcOfwwpbJr_SS3_36u4Djbrr-X5_SPft2LpFxXO7L0fjkB4qW6avtDRJTzZX0dNA9r3Kjs_OrV0dw4WjcmDnZI5cS-_Uuko6tcUSed7_sdhwpmyWtLV8ceC_u779f_2hgaz-X7rwYI-qVIpX4_htL-vtINjoDUl44L2JJxTlpxgbXHWyIUtY6jeA0ZjKyhWtHe6AFXARIzzsWFwG-XB9CAtVHgCnDcSYe_7lR4lPbL8oQ4QbF-TnO3DR4XpxfDoO9UTTPVi7aiWcz7CXNxSMxIRRtccacNQKWAB_ktpxxsx7Czarm_cLEZuom8xg8gDxKrL4P5XqNvI-I1H6jQAw3VgCAznpu_JK4CHKyFrhX88IVliamBER2jEX5UdKEThSqg5do_sHr6Wfhppgz70OG5fZgaqa3XGZmM-FRNw3FtZ-5QaBfXX3glEae29ivhEIiKe_20c7eQpxnGbAL_tg2hpyePnQKUWvdbAAKAL8O7cROST7hl_FG8HGW_TZbdUkrxzcy-_OH2rTO-p15z8B74bd8HeaRqh2IHSA3g1y_-Zzz0b_ZIxbmQI8_8i3G-W93LGkFBgTsmzw6nV96qGnBoPtGV01DwVi78SI0wZWuXFBsoQER2CV_PDkuIr-QVcsRhvZS9wyDoXdyQonwbUWENDEDoNG0IE6VtUmiABfY3i3rPa6GjxXy-FG1lCN7G9TDuYl7i3WRvL0zIgUC4HeFXtiwm4MQK2JQZddv0BYEbF2P0-GBy-NzngsaXcSMtUjmoqjrQW2LF43L0hqy27PBb9LSjIXGSANi5hB42SLmmG0OUTxH3jEyvdixkM8cHuyYFrQK0__CySChnVwls61FoCYMLriOO3g0r13H4o3ACfcEEruzwzA4EiVQe3PQnzH8WbcyW1-3j3sOPK7K24fngKxuCqRLfPYV80s7KqqMTPwumBtRursB5YSgQALZW6vvhSnI1VvDNwy.DO1Rm48q7k_7xiQknmpg8Q"
    }'
done

# # Loop for Command 3
# for i in {1..50}; do
#     curl --location 'https://api.review-bav.build.account.gov.uk/verify-account' \
#     --header 'x-govuk-signin-session-id: e6a71dfc-0053-49e3-a046-d295f59f593b' \
#     --header 'Content-Type: application/json' \
#     --data '{
#         "account_number": "444444444",
#         "sort_code": "204578"
#     }'
# done

# # Loop for Command 4
# for i in {1..50}; do
#     curl --location 'https://api.review-bav.build.account.gov.uk/authorization' \
#     --header 'session-id: d17608f6-084f-4800-b924-f6a5508d3416'
# done

# # Loop for Command 5
# for i in {1..50}; do
#     curl --location 'https://api.review-bav.build.account.gov.uk/token' \
#     --header 'Content-Type: text/plain' \
#     --data 'code=123456&grant_type=authorization_code&redirect_uri=https://ipvstub.review-bav.build.account.gov.uk/redirect?id=bav'
# done

# # Loop for Command 6
# for i in {1..50}; do
#     curl --location --request POST 'https://api.review-bav.build.account.gov.uk/abort' \
#     --header 'x-govuk-signin-session-id: 1234'
# done

# # Loop for Command 7
# for i in {1..50}; do
#     curl --location --request POST 'https://api.review-bav.build.account.gov.uk/userinfo' \
#     --header 'Authorization: Bearer'
# done

# # Loop for Command 8
# for i in {1..50}; do
#     curl --location 'https://api.review-bav.build.account.gov.uk/personInfo' \
#     --header 'x-govuk-signin-session-id: 134532524' \
#     --data ''
# done