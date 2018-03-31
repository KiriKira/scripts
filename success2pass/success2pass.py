#!/home/kiri/.local/share/virtualenvs/success2pass-rJwRoDt2/bin/python
"""
This is a simple example of Success2Pass API.
You can customize the command to be excute to suit for yourself.
Requirements: Python3.x , Django 1.8 ,  
"""

import json
import subprocess

from django.conf import settings
from django.http import HttpResponse
from django.conf.urls import url


setting = {
    'DEBUG': True,
    'ROOT_URLCONF': __name__
}

settings.configure(**setting)

CMD_TEMPLATE = "ufw allow from {}"


class JSONResponse(HttpResponse):
    """
    An HttpResponse that renders its content into JSON.
    """

    def __init__(self, data, **kwargs):
        content = json.dumps(data)
        kwargs['content_type'] = 'application/json'
        super(JSONResponse, self).__init__(content, **kwargs)


def get_client_ip(request):
    """
    A method to get the cient ip address.
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')

    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[-1].strip()
    elif request.META.get('HTTP_X_REAL_IP'):
        ip = request.META.get('HTTP_X_REAL_IP')
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def s2ptestview(request):
    ip = get_client_ip(request)
    resp = {"status": 200, "info": "Your ip address is " + ip}
    return JSONResponse(resp)


def s2pview(request):
    ip = get_client_ip(request)
    cmd = CMD_TEMPLATE.format(ip, ip)
    subprocess.call(cmd, shell=True)
    resp = {"status": 200, "info": "Success! Now your ip " +
            ip + " is added to the rules."}
    return JSONResponse(resp)

urlpatterns = [url('^s2ptest$', s2ptestview, name="s2ptestview"),
               url('^s2p$', s2pview, name="s2pview")]

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "setting")

application = get_wsgi_application()

if __name__ == '__main__':
    import sys
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
