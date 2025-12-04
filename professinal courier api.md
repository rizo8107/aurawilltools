've attached the PDF for your API integration. Your API token is mentioned within the document. Kindly review the PDF, as it will assist you in integrating your software with our system. During the integration, please remember to create a POD copy with the consignment number barcode, as it is crucial for courier tracking. A POD sample is available in the API PDF file. Please prepare it similarly.  

TPC-Token: wP9z99UrOQVaHDhnJCPQhVkxj0TLAuAe
CUST_CODE: AWFI

API Instructions for Consignment Booking

CIS Technologies 1
API Instructions for Consignment Booking

Overview
- The API allows integration of TPC's booking platform with other applications using
RESTful principles.
- All requests are POST requests made via HTTPS to the following URL.
- Responses are returned in JSON format.

URL (endpoint)
https://tpccjb.com/api/tpc-bookings.php

Getting Started
- A valid API key is required to send requests, obtainable from the IT Admin.
- The API only responds to HTTPS-secured communications.

API Instructions for Consignment Booking

CIS Technologies 2
JSON Structure
- Requests must include a JSON-formatted body with the booking content and metadata.
- Mandatory parameters include customer code, consignee name, pin code, quantity,
weight, and packaging type.
Sample Format
[{
"cust_code": "ABG",
"consignee_name": "ABC Company",
"consignee_add1": "address1",
"consignee_add2": "address2",
"consignee_add3": "address3",
"pincode": "641007",
"consignee_telephone": "9876543210",
"consignee_mobile": "9876543210",
"consignee_attention": "Mr. Raja",
"prod_code": "prod001",
"prod_type": "packet",
"sub_prod_code": "subprod001",
"pisces": "10",
"weight": "1.500",
"pack_type": "packet",
"amount": "800",
"collect_amount": "800",
"refno": "CIS123"
}]
Request Data Parameter Details
1. `cust_code`: Customer Code provided by TPC.
2. `refno`: Reference number, up to 20 alphanumeric characters.
3. `consignee_name`, `consignee_add1`, `consignee_add2`, `consignee_add3`,
`consignee_telephone`, `consignee_mobile`, `consignee_attention`: Consignee details.
4. `pincode`: Postal code of the consignee.
5. `prod_code`, `prod_type`, `sub_prod_code`: Product details.
6. `pisces`: Number of items.
7. `weight`: Weight in kilograms.
8. `pack_type`: Type of document.
9. `amount`, `collect_amount`: Booking and collected amounts.

API Instructions for Consignment Booking

CIS Technologies 3
Sample Code (Postman cURL Request)
curl --location 'https://tpccjb.com/api/tpc-bookings.php' \
--header 'Tpc-Token: ovI1pATr3l4N1g7RfuWRZIDw4RAzJVih' \
--header 'Content-Type: application/json' \
--data '[
{
"cust_code": "ABG",
"consignee_name": "ABC Company",
"consignee_add1": "address1",
"consignee_add2": "address2",
"consignee_add3": "address3",
"pincode": "641007",
"consignee_telephone": "9876543210",
"consignee_mobile": "9876543210",
"consignee_attention": "Mr. Raja",
"prod_code": "prod001",
"prod_type": "packet",
"sub_prod_code": "subprod001",
"pisces": "10",
"weight": "1.500",
"pack_type": "packet",
"amount": "800",
"collect_amount": "800",
"refno": "CIS123"
}
]'
API Responses (Successful)
[
{
"status": "1",
"result": "Success",
"cotno": 15018,
"destination": "CJB"
}
]

API Instructions for Consignment Booking

CIS Technologies 4
API Responses (Unsuccessful)
[
{
"success": "0",
"result": "Authorization Failed / Empty Records"
}
]
Possible Error Responses:
- Authorization Failed / Empty Records
- Authorization Failed / Invalid Token
- The customer code (ABGABCD) not assigned to you
- COT Not Available
- Service not available for [pincode]
- Duplicate Booking [reference number]



