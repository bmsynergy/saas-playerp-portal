"""Reproduce PE-469 against the downloaded package (no hardware).
Usage: PYTHONPATH=<websockets16+qrcode8.2> python3 tests/pe469-firmware-fixture.py <extracted-package> [serve]
Uses only test port 18798; stop serve with Ctrl-C. Run tests before starting serve.
"""
import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(sys.argv[1]).resolve()))
from wifi.tests import test_pe469_activation as activation
if len(sys.argv)>2 and sys.argv[2]=='serve':
    case=activation.ActivationBase();case.setUp()
    m=activation.m;m.AP_IP='127.0.0.1';m.AP_NET=m.ipaddress.ip_network('127.0.0.0/8')
    server=m.SetupServer(('127.0.0.1',18798),m.Handler);server.controller=case.c;case.c.http=server
    try: server.serve_forever()
    finally: server.server_close();case.doCleanups()
else:
    original=activation.m.SetupServer.__init__
    def init(self,addr,*args,**kwargs): return original(self,('127.0.0.1',18798),*args,**kwargs)
    activation.m.SetupServer.__init__=init
    suite=unittest.defaultTestLoader.loadTestsFromNames(['tests.test_pe469','wifi.tests.test_pe469_activation'])
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(not result.wasSuccessful())
