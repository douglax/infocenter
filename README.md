# infocenter
Home information center using a Raspberry Pi Zero

This project is meant to display several widgets in a single web page.

At this moment I have:

Google Calendar for family events (1)
Weather radar picture (2)
Traffic conditions (3)
Weather forecast
RSS news feed
Time/Date

Nice to have / wish list:
Dolar/peso exchange rate graph
Days until Christmas


ToDo:
1) Enhance whole screen looking
2) Adopt Best Practice (i.e replace tables w/ divs)




(1) There are recurring tasks for family members (D2 means Diego - Walk the dog)
(2) radargrab.sh retrieves gif image from website and converts it to static jpg image, a cronjob runs it periodically
(3) Google doesn't permit (that I'm aware of) embeeding traffic layer directly, so traffic.html does the job and it is inserted as an iframe in main page.
