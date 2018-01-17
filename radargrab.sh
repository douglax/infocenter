#!/bin/bash


#cd /var/www/html

cd /usr/share/nginx/html

rm -f radar.jpg isemex.gif
wget -q https://sirocco.accuweather.com/sat_mosaic_640x480_public/ei/isemex.gif
convert isemex.gif -resize 368x300! radar.jpg

rm -f /var/www/html/radar.jpg
cp radar.jpg /var/www/html/
