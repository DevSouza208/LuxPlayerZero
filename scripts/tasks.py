"""Update the reviewable task CSV without discarding unrelated rows."""
import csv,sys,datetime,pathlib
p=pathlib.Path(__file__).resolve().parents[1]/'docs/TAREFAS.csv'
with p.open(encoding='utf-8-sig',newline='') as f: rows=list(csv.DictReader(f,delimiter=';'))
if len(sys.argv)>1:
 ids=set(sys.argv[1].split(',')); status=sys.argv[2]
 if status not in ['pendente','em construção','concluído','bloqueado']: raise ValueError(status)
 for row in rows:
  if row['id'] in ids:
   row.update(status=status,evidencia=sys.argv[3] if len(sys.argv)>3 else row['evidencia'],bloqueio=sys.argv[4] if len(sys.argv)>4 else '',atualizado_em=datetime.date.today().isoformat())
 with p.open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=rows[0],delimiter=';');w.writeheader();w.writerows(rows)
else:
 for row in rows: print(row['id'],row['status'],row['tarefa'])
