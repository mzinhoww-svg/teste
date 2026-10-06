import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))            # tools/
for p in (os.path.join(RAIZ, "atendente"), os.path.join(RAIZ, "prospeccao")):
    if p not in sys.path:
        sys.path.insert(0, p)
