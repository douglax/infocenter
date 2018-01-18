Configuration is based on Rasbian Jessie

If unsure, type the following command

cat /etc/os-release


Modify autostart file to configure display options

sudo nano /home/pi/.config/lxsession/LXDE-pi/autostart

Enter the following to configure monitor display settings.



Disable screen saver
@xset s off


Disable DPMS (Energy Star)
@xset -dpms


Disable blanking the video device
@xset s noblank


Setup Chromium to autostart in kiosk mode 

@/usr/bin/chromium-browser -kiosk http://webserver/infocenter.html



Install Unclutter to remove the mouse cursor from the screen.

sudo apt-get install unclutter
