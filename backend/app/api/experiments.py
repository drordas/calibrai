import uuid
import json
import asyncio
import io
import re
import shutil
import zipfile
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.db.models import User, Experiment, ExperimentShare, DatasetRecord, DatasetShare
from backend.app.api.auth import get_current_user
from backend.app.core.config import settings
from backend.app.core.dataset_engine import dataset_engine
from backend.app.schemas.experiment import (
    ExperimentCreate,
    ExperimentSummary,
    ExperimentResponse,
    ExperimentShareRequest,
    ExperimentShareRespondRequest,
    ExperimentShareEntryOut,
)
from backend.app.core.experiment_queue import experiment_queue

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


def _get_accessible_experiment(
    experiment_id: str,
    user: User,
    db: Session,
    require_edit: bool = False,
) -> tuple[Experiment, Optional[ExperimentShare]]:
    exp = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experimento no encontrado")

    share = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.experiment_id == experiment_id,
            ExperimentShare.target_user_id == user.id,
        )
        .first()
    )
    if exp.user_id == user.id:
        return exp, share
    if not share:
        raise HTTPException(status_code=404, detail="Experimento no encontrado")
    if require_edit and share.share_mode == "view":
        raise HTTPException(status_code=403, detail="Este experimento está compartido contigo en modo solo lectura")
    return exp, share


@router.get("", response_model=List[ExperimentSummary])
def list_experiments(
    status: Optional[str] = Query(None, description="Filtrar por estado"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    own_query = db.query(Experiment).filter(Experiment.user_id == current_user.id)
    if status:
        own_query = own_query.filter(Experiment.status == status)
    own_exps = own_query.order_by(Experiment.created_at.desc()).all()

    incoming_shares = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.target_user_id == current_user.id,
            ExperimentShare.status.in_(["pending", "accepted"]),
        )
        .all()
    )
    outgoing_shared_ids = {
        s.experiment_id
        for s in db.query(ExperimentShare)
        .filter(
            ExperimentShare.owner_user_id == current_user.id,
            ExperimentShare.share_mode.in_(["view", "edit"]),
            ExperimentShare.status.in_(["pending", "accepted"]),
        )
        .all()
    }

    share_by_exp_id = {s.experiment_id: s for s in incoming_shares}
    shared_exp_ids = [s.experiment_id for s in incoming_shares]

    extra_shared_exps = []
    if shared_exp_ids:
        shared_query = db.query(Experiment).filter(
            Experiment.id.in_(shared_exp_ids),
            Experiment.user_id != current_user.id,
        )
        if status:
            shared_query = shared_query.filter(Experiment.status == status)
        extra_shared_exps = shared_query.order_by(Experiment.created_at.desc()).all()

    owner_ids = {s.owner_user_id for s in incoming_shares}
    owners = (
        {u.id: u.username for u in db.query(User).filter(User.id.in_(owner_ids)).all()}
        if owner_ids
        else {}
    )

    combined = list(own_exps) + list(extra_shared_exps)
    combined.sort(key=lambda e: e.created_at or 0, reverse=True)

    result: List[ExperimentSummary] = []
    for exp in combined:
        summary = ExperimentSummary.model_validate(exp, from_attributes=True)
        share = share_by_exp_id.get(exp.id)
        if share:
            summary = summary.model_copy(
                update={
                    "is_shared": True,
                    "is_shared_by_owner": exp.id in outgoing_shared_ids,
                    "share_mode": share.share_mode,
                    "share_status": share.status,
                    "shared_by": owners.get(share.owner_user_id, ""),
                    "share_id": share.id,
                }
            )
        else:
            summary = summary.model_copy(
                update={"is_shared_by_owner": exp.id in outgoing_shared_ids}
            )
        result.append(summary)
    return result

@router.post("", response_model=ExperimentResponse)
async def create_experiment(
    req: ExperimentCreate,
    auto_start: bool = Query(True, description="Iniciar o encolar inmediatamente"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if auto_start and not req.model_ids:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos un modelo para ejecutar el experimento.")
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    eval_spec_payload = dict(req.eval_spec or {})
    if req.spec_columns:
        eval_spec_payload["spec_columns"] = list(req.spec_columns)
    experiment = Experiment(
        id=exp_id,
        user_id=current_user.id,
        name=req.name,
        description=req.description or "",
        dataset_id=req.dataset_id,
        dataset_name=req.dataset_name or "",
        input_columns=req.input_columns,
        context_columns=req.context_columns,
        id_column=req.id_column,
        model_ids=req.model_ids,
        ground_truth_dataset_id=req.ground_truth_dataset_id or (req.ground_truth_dataset_ids[0] if req.ground_truth_dataset_ids else None),
        ground_truth_dataset_ids=req.ground_truth_dataset_ids or ([req.ground_truth_dataset_id] if req.ground_truth_dataset_id else []),
        ground_truth_name=req.ground_truth_name or "Experto Humano",
        template=req.template,
        system_prompt=req.system_prompt or "",
        task_type=req.task_type or "generic",
        eval_spec=eval_spec_payload,
        sample_size=req.sample_size,
        execution_mode=req.execution_mode,
        model_temperatures=req.model_temperatures or {},
        status="draft",
        current_model_index=0,
        current_sample_index=0,
        total_samples=req.sample_size,
        progress_pct=0.0,
        raw_results={m: [] for m in req.model_ids},
        summaries={},
        pairwise_matrix=[],
        best_performers={}
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)

    if auto_start:
        await experiment_queue.enqueue_or_start(exp_id)
        db.refresh(experiment)

    return experiment

@router.put("/{experiment_id}", response_model=ExperimentResponse)
def update_experiment_template(
    experiment_id: str,
    req: ExperimentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp = db.query(Experiment).filter(
        Experiment.id == experiment_id,
        Experiment.user_id == current_user.id
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    if exp.status != "draft":
        raise HTTPException(status_code=400, detail="Solo se pueden editar plantillas en estado borrador")

    eval_spec_payload = dict(req.eval_spec or {})
    if req.spec_columns:
        eval_spec_payload["spec_columns"] = list(req.spec_columns)

    exp.name = req.name
    exp.description = req.description or ""
    exp.dataset_id = req.dataset_id
    exp.dataset_name = req.dataset_name or ""
    exp.input_columns = req.input_columns
    exp.context_columns = req.context_columns
    exp.id_column = req.id_column
    exp.model_ids = req.model_ids
    exp.ground_truth_dataset_id = req.ground_truth_dataset_id or (req.ground_truth_dataset_ids[0] if req.ground_truth_dataset_ids else None)
    exp.ground_truth_dataset_ids = req.ground_truth_dataset_ids or ([req.ground_truth_dataset_id] if req.ground_truth_dataset_id else [])
    exp.ground_truth_name = req.ground_truth_name or "Experto Humano"
    exp.template = req.template
    exp.system_prompt = req.system_prompt or ""
    exp.task_type = req.task_type or "generic"
    exp.eval_spec = eval_spec_payload
    exp.sample_size = req.sample_size
    exp.total_samples = req.sample_size
    exp.execution_mode = req.execution_mode
    exp.model_temperatures = req.model_temperatures or {}

    db.commit()
    db.refresh(exp)
    return exp

@router.get("/{experiment_id}", response_model=ExperimentResponse)
def get_experiment(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp, share = _get_accessible_experiment(experiment_id, current_user, db, require_edit=False)
    resp = ExperimentResponse.model_validate(exp, from_attributes=True)
    if share:
        owner = db.query(User).filter(User.id == share.owner_user_id).first()
        resp = resp.model_copy(
            update={
                "is_shared": True,
                "share_mode": share.share_mode,
                "share_status": share.status,
                "shared_by": owner.username if owner else "",
                "share_id": share.id,
            }
        )
    return resp


@router.get("/{experiment_id}/shares", response_model=List[ExperimentShareEntryOut])
def list_experiment_shares(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    shares = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.experiment_id == experiment_id,
            ExperimentShare.owner_user_id == current_user.id,
            ExperimentShare.share_mode.in_(["view", "edit"]),
            ExperimentShare.status.in_(["pending", "accepted"]),
        )
        .all()
    )
    if not shares:
        return []
    user_ids = {s.target_user_id for s in shares}
    users = {u.id: u.username for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    return [
        ExperimentShareEntryOut(
            id=s.id,
            target_user_id=s.target_user_id,
            target_username=users.get(s.target_user_id, ""),
            share_mode=s.share_mode,
            status=s.status,
        )
        for s in shares
    ]


@router.patch("/{experiment_id}/shares/{share_id}", response_model=ExperimentShareEntryOut)
def update_experiment_share_mode(
    experiment_id: str,
    share_id: int,
    req: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_mode = str(req.get("share_mode") or "").strip()
    if new_mode not in ("view", "edit"):
        raise HTTPException(status_code=400, detail="Modo de compartición inválido")
    share = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.id == share_id,
            ExperimentShare.experiment_id == experiment_id,
            ExperimentShare.owner_user_id == current_user.id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Compartición no encontrada")
    share.share_mode = new_mode
    db.commit()
    db.refresh(share)
    target_user = db.query(User).filter(User.id == share.target_user_id).first()
    return ExperimentShareEntryOut(
        id=share.id,
        target_user_id=share.target_user_id,
        target_username=target_user.username if target_user else "",
        share_mode=share.share_mode,
        status=share.status,
    )


@router.delete("/{experiment_id}/shares/{share_id}")
def revoke_experiment_share(
    experiment_id: str,
    share_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    share = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.id == share_id,
            ExperimentShare.experiment_id == experiment_id,
            ExperimentShare.owner_user_id == current_user.id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Compartición no encontrada")
    db.delete(share)
    db.commit()
    return {"status": "revoked", "share_id": share_id}


@router.post("/{experiment_id}/share")
def share_experiment(
    experiment_id: str,
    req: ExperimentShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exp = db.query(Experiment).filter(
        Experiment.id == experiment_id,
        Experiment.user_id == current_user.id,
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experimento no encontrado")
    if exp.status not in ("completed", "running", "queued", "paused", "draft"):
        raise HTTPException(status_code=400, detail="Solo se pueden compartir plantillas o experimentos en ejecución, pausados o finalizados")
    if req.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes compartir un experimento contigo mismo")

    mode = req.share_mode if req.share_mode in ("view", "edit", "copy") else "view"
    target_user = db.query(User).filter(User.id == req.target_user_id, User.is_active == True).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario destino no encontrado")

    effective_dataset_id = exp.dataset_id
    if exp.status == "draft" and exp.dataset_id:
        ds_rec = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == exp.dataset_id).first()
        owned_by_target = bool(ds_rec and ds_rec.owner_user_id == target_user.id)
        existing_ds_share = (
            db.query(DatasetShare)
            .filter(
                DatasetShare.target_user_id == target_user.id,
                (DatasetShare.dataset_id == exp.dataset_id) | (DatasetShare.source_dataset_id == exp.dataset_id),
            )
            .first()
        )
        if not owned_by_target and not existing_ds_share:
            ds_mode = req.dataset_share_mode if req.dataset_share_mode in ("view", "edit", "copy") else "view"
            if ds_mode == "copy":
                ds_summary = dataset_engine.get_dataset(exp.dataset_id)
                meta = dataset_engine.datasets.get(exp.dataset_id)
                src_path = meta.get("file_path") if meta else None
                if not ds_summary or not src_path or not Path(src_path).exists():
                    raise HTTPException(status_code=500, detail="No se encontró el archivo origen del dataset para copiar")
                copy_stem = f"copy_{uuid.uuid4().hex[:8]}_{Path(src_path).stem}"
                copy_filename = f"{copy_stem}{Path(src_path).suffix}"
                copy_path = settings.upload_dir / copy_filename
                shutil.copy2(src_path, copy_path)
                copied_summary = dataset_engine.register_dataset(
                    file_path=copy_path,
                    name=f"{ds_summary.name} (Copia)",
                    is_sample=False,
                    dataset_id=f"upload_{copy_stem}",
                    is_ground_truth=ds_summary.is_ground_truth,
                    force_new=True,
                )
                effective_dataset_id = copied_summary.id
                db.add(
                    DatasetRecord(
                        dataset_id=effective_dataset_id,
                        owner_user_id=target_user.id,
                        display_name=f"{ds_summary.name} (Copia)",
                        is_ground_truth=ds_summary.is_ground_truth,
                    )
                )
            db.add(
                DatasetShare(
                    dataset_id=effective_dataset_id,
                    source_dataset_id=exp.dataset_id,
                    owner_user_id=current_user.id,
                    target_user_id=target_user.id,
                    share_mode=ds_mode,
                    status="accepted",
                )
            )
            db.flush()
        elif existing_ds_share:
            effective_dataset_id = existing_ds_share.dataset_id

    target_exp_id = exp.id
    if mode == "copy":
        new_exp_id = f"exp_{uuid.uuid4().hex[:8]}"
        cloned = Experiment(
            id=new_exp_id,
            user_id=target_user.id,
            name=f"{exp.name} (Copia)",
            description=exp.description or "",
            dataset_id=effective_dataset_id,
            dataset_name=exp.dataset_name or "",
            input_columns=list(exp.input_columns or []),
            context_columns=list(exp.context_columns or []),
            id_column=exp.id_column,
            model_ids=list(exp.model_ids or []),
            ground_truth_dataset_id=exp.ground_truth_dataset_id,
            ground_truth_dataset_ids=list(exp.ground_truth_dataset_ids or []),
            ground_truth_name=exp.ground_truth_name,
            template=exp.template,
            system_prompt=exp.system_prompt or "",
            task_type=exp.task_type or "generic",
            eval_spec=dict(exp.eval_spec or {}),
            sample_size=exp.sample_size,
            execution_mode=exp.execution_mode,
            model_temperatures=dict(exp.model_temperatures or {}),
            status=exp.status,
            current_model_index=exp.current_model_index,
            current_sample_index=exp.current_sample_index,
            total_samples=exp.total_samples,
            progress_pct=exp.progress_pct,
            raw_results=dict(exp.raw_results or {}),
            summaries=dict(exp.summaries or {}),
            pairwise_matrix=list(exp.pairwise_matrix or []),
            best_performers=dict(exp.best_performers or {}),
            completed_at=exp.completed_at,
            notification_read=True,
        )
        db.add(cloned)
        db.flush()
        target_exp_id = new_exp_id

    existing = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.experiment_id == target_exp_id,
            ExperimentShare.target_user_id == target_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Este experimento ya está compartido con ese usuario.",
        )

    db.add(
        ExperimentShare(
            experiment_id=target_exp_id,
            owner_user_id=current_user.id,
            target_user_id=target_user.id,
            share_mode=mode,
            status="pending",
        )
    )
    db.commit()
    return {"status": "shared", "experiment_id": target_exp_id, "share_mode": mode, "target_username": target_user.username}


@router.post("/shares/{share_id}/respond")
def respond_to_experiment_share(
    share_id: int,
    req: ExperimentShareRespondRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    share = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.id == share_id,
            ExperimentShare.target_user_id == current_user.id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Invitación de experimento no encontrada")

    if req.accept:
        share.status = "accepted"
        db.commit()
        return {"status": "accepted", "share_id": share_id}

    is_copy = share.share_mode == "copy"
    copy_exp_id = share.experiment_id
    db.delete(share)
    if is_copy:
        copy_exp = db.query(Experiment).filter(Experiment.id == copy_exp_id, Experiment.user_id == current_user.id).first()
        if copy_exp:
            db.delete(copy_exp)
    db.commit()
    return {"status": "rejected", "share_id": share_id}

@router.post("/{experiment_id}/start", response_model=ExperimentResponse)
async def start_experiment(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    await experiment_queue.enqueue_or_start(experiment_id)
    db.refresh(exp)
    return exp

@router.post("/{experiment_id}/pause", response_model=ExperimentResponse)
async def pause_experiment(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    await experiment_queue.pause_experiment(experiment_id)
    db.refresh(exp)
    return exp

@router.post("/{experiment_id}/resume", response_model=ExperimentResponse)
async def resume_experiment(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    await experiment_queue.resume_experiment(experiment_id)
    db.refresh(exp)
    return exp

@router.post("/{experiment_id}/retry-failed", response_model=ExperimentResponse)
async def retry_failed_experiment_samples(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    await experiment_queue.retry_failed_samples(experiment_id)
    db.refresh(exp)
    return exp

@router.post("/{experiment_id}/cancel", response_model=ExperimentResponse)
async def cancel_experiment(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    await experiment_queue.cancel_experiment(experiment_id)
    db.refresh(exp)
    return exp

@router.delete("/{experiment_id}")
async def delete_experiment(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    shared_for_user = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.experiment_id == experiment_id,
            ExperimentShare.target_user_id == current_user.id,
        )
        .first()
    )
    if shared_for_user:
        is_copy = shared_for_user.share_mode == "copy"
        db.delete(shared_for_user)
        if is_copy:
            copy_exp = db.query(Experiment).filter(
                Experiment.id == experiment_id,
                Experiment.user_id == current_user.id,
            ).first()
            if copy_exp:
                db.delete(copy_exp)
        db.commit()
        return {"message": "Experimento compartido eliminado de tu perfil", "id": experiment_id}

    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    active_shares = (
        db.query(ExperimentShare)
        .filter(
            ExperimentShare.experiment_id == experiment_id,
            ExperimentShare.share_mode.in_(["view", "edit"]),
        )
        .count()
    )
    if active_shares > 0:
        raise HTTPException(
            status_code=400,
            detail="No puedes eliminar este experimento mientras esté compartido con otros usuarios. Deja de compartirlo primero.",
        )

    if exp.status == "running":
        await experiment_queue.cancel_experiment(experiment_id)

    db.query(ExperimentShare).filter(ExperimentShare.experiment_id == experiment_id).delete(synchronize_session=False)
    db.delete(exp)
    db.commit()
    return {"message": "Experimento eliminado correctamente", "id": experiment_id}

class RecalculateRequest(BaseModel):
    eval_spec: Optional[Dict[str, Any]] = None

@router.post("/{experiment_id}/recalculate", response_model=ExperimentResponse)
async def recalculate_experiment_metrics(
    experiment_id: str,
    req_body: Optional[RecalculateRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    from backend.app.metrics.engine import metrics_engine
    from backend.app.schemas.prompt import EvaluationSpec
    from sqlalchemy.orm.attributes import flag_modified

    raw_results = exp.raw_results or {}
    if not raw_results:
        return exp

    if req_body and req_body.eval_spec:
        merged = {**(exp.eval_spec or {}), **req_body.eval_spec}
        exp.eval_spec = merged
        flag_modified(exp, "eval_spec")

    eval_spec_dict = exp.eval_spec or {}
    eval_spec = EvaluationSpec(**eval_spec_dict) if eval_spec_dict else EvaluationSpec()

    new_summaries = {}
    for rater_id, res_list in raw_results.items():
        summary = metrics_engine.compute_model_metrics(
            model_id=rater_id,
            results=res_list,
            eval_spec=eval_spec
        )
        s_dict = summary.model_dump()
        if rater_id.startswith("human_expert") or rater_id == "human_expert":
            s_dict["is_human_baseline"] = True
            if exp.summaries and rater_id in exp.summaries and "model_name" in exp.summaries[rater_id]:
                s_dict["model_name"] = exp.summaries[rater_id]["model_name"]
        new_summaries[rater_id] = s_dict

    all_raters = list(raw_results.keys())
    pairwise_list = []
    human_rater_ids = [r for r in all_raters if r.startswith("human_expert") or r == "human_expert"]

    for i in range(len(all_raters)):
        for j in range(i + 1, len(all_raters)):
            ma = all_raters[i]
            mb = all_raters[j]
            pair_comp = metrics_engine.compute_pairwise_comparison(
                model_a=ma,
                results_a=raw_results.get(ma, []),
                model_b=mb,
                results_b=raw_results.get(mb, []),
                eval_spec=eval_spec
            )
            if (ma in human_rater_ids) or (mb in human_rater_ids):
                pair_comp.is_vs_human = True
            pairwise_list.append(pair_comp)

    human_human_pairs = [
        p for p in pairwise_list
        if p.model_a in human_rater_ids and p.model_b in human_rater_ids
    ]
    if human_human_pairs and human_human_pairs[0].cohens_kappa > 0:
        h_kappa = human_human_pairs[0].cohens_kappa
        for p in pairwise_list:
            if p.is_vs_human:
                p.human_baseline_ratio = round(p.cohens_kappa / h_kappa, 4)

    best = experiment_queue._calculate_best_performers(new_summaries)

    exp.summaries = new_summaries
    exp.pairwise_matrix = [p.model_dump() for p in pairwise_list]
    exp.best_performers = best
    if pairwise_list:
        exp.task_type = pairwise_list[0].task_type
    db.commit()
    db.refresh(exp)
    return exp

@router.get("/{experiment_id}/stream")
async def stream_experiment_progress(
    experiment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Server-Sent Events (SSE) stream for live progress updates."""
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    queue = experiment_queue.subscribe(experiment_id)

    async def event_generator():
        try:
            # First send initial status snapshot
            initial_data = {
                "experiment_id": exp.id,
                "status": exp.status,
                "progress_pct": exp.progress_pct,
                "current_model_index": exp.current_model_index,
                "current_sample_index": exp.current_sample_index,
                "total_samples": exp.total_samples,
                "summaries": exp.summaries,
                "pairwise_matrix": exp.pairwise_matrix,
                "best_performers": exp.best_performers
            }
            yield f"event: snapshot\ndata: {json.dumps(initial_data)}\n\n"

            while True:
                # Wait for next event broadcast
                msg = await queue.get()
                event = msg.get("event", "update")
                data = msg.get("data", {})
                yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                if event in ["experiment_completed", "cancelled"]:
                    break
        finally:
            experiment_queue.unsubscribe(experiment_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

def _resolve_sample_id(r: Dict[str, Any], idx: int, id_col: Optional[str]) -> Tuple[str, str]:
    row_ctx = r.get("row_context") or {}
    if id_col and id_col in row_ctx and row_ctx[id_col] is not None and str(row_ctx[id_col]).strip() != "":
        return (id_col, str(row_ctx[id_col]).strip())
    if r.get("sample_id") is not None and str(r.get("sample_id")).strip() != "":
        return (id_col or "ID", str(r.get("sample_id")).strip())
    for cand in ["review_id", "id", "ID", "Id", "comment_id", "item_id", "row_id", "uid", "code", "key"]:
        if cand in row_ctx and row_ctx[cand] is not None and str(row_ctx[cand]).strip() != "":
            return (cand, str(row_ctx[cand]).strip())
    return (id_col or "ID", str(r.get("sample_index", idx) + 1))

@router.get("/{experiment_id}/audit/model/{model_id:path}")
def audit_model_failures(
    experiment_id: str,
    model_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns audit details for a specific model in an experiment:
    - Hallucinated quotes (Verbatim failures)
    - Self-contradictory overlapping quotes (Disjointness failures)
    - Rule violations
    """
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    raw_results = exp.raw_results or {}
    results = raw_results.get(model_id, [])
    if not results:
        for k in raw_results.keys():
            if model_id == k or model_id in k or k.endswith(model_id):
                results = raw_results[k]
                model_id = k
                break

    from backend.app.metrics.engine import extract_aspect_items, normalize_for_verbatim, classify_verbatim_quote, resolve_source_text

    verbatim_mode = "tolerant"
    if exp.eval_spec and isinstance(exp.eval_spec, dict):
        m_cfg = exp.eval_spec.get("methodology_config") or {}
        p1_cfg = m_cfg.get("pilar_1") or {}
        if p1_cfg.get("verbatim_mode") in ["strict", "tolerant"]:
            verbatim_mode = p1_cfg["verbatim_mode"]

    verbatim_failures = []
    typo_corrections = []
    disjoint_failures = []
    rule_failures = []

    for idx, r in enumerate(results):
        parsed = r.get("parsed_json") or {}
        row_ctx = r.get("row_context") or {}
        source_text = resolve_source_text(row_ctx, exp.eval_spec, exp.input_columns)
        resolved_id_col, resolved_sample_id = _resolve_sample_id(r, idx, exp.id_column)

        aspects = extract_aspect_items(parsed)

        sample_hallucinations = []
        sample_typos = []
        seen_quotes = set()
        pos_snippets = set()
        neg_snippets = set()
        neu_snippets = set()

        for item in aspects:
            citas = list(item.get("citas") or item.get("snippets") or [])
            if isinstance(citas, str):
                citas = [citas]
            for field in ["markers_positive", "markers_negative", "markers_neutral"]:
                citas.extend(item.get(field, []))

            for snip in set(citas):
                clean = normalize_for_verbatim(snip)
                if not clean or clean in ["blank", "none"] or clean in seen_quotes:
                    continue
                seen_quotes.add(clean)
                cls_res = classify_verbatim_quote(snip, source_text)
                if cls_res["status"] == "typo_corrected":
                    sample_typos.append({
                        "quote": snip,
                        "matched_span": cls_res["matched_span"],
                        "similarity": cls_res["similarity"]
                    })
                    if verbatim_mode == "strict":
                        sample_hallucinations.append(snip)
                elif cls_res["status"] == "hallucinated":
                    sample_hallucinations.append(snip)

            for snip in item.get("markers_positive", []):
                cs = normalize_for_verbatim(snip)
                if cs and cs not in ["blank", "none"]:
                    pos_snippets.add(cs)
            for snip in item.get("markers_negative", []):
                cs = normalize_for_verbatim(snip)
                if cs and cs not in ["blank", "none"]:
                    neg_snippets.add(cs)
            for snip in item.get("markers_neutral", []):
                cs = normalize_for_verbatim(snip)
                if cs and cs not in ["blank", "none"]:
                    neu_snippets.add(cs)

            pol = str(item.get("polaridad") or item.get("sentiment") or "").lower()
            if pol not in ["positive", "negative", "neutral", "mixed", "blank", ""]:
                rule_failures.append({
                    "sample_index": r.get("sample_index", idx),
                    "sample_id": resolved_sample_id,
                    "id_column": resolved_id_col,
                    "source_text": source_text,
                    "rule_broken": f"Polaridad inválida '{pol}'",
                    "details": f"Dimensión '{item.get('dimension')}' devolvió polaridad no canónica."
                })

        if sample_hallucinations:
            verbatim_failures.append({
                "sample_index": r.get("sample_index", idx),
                "sample_id": resolved_sample_id,
                "id_column": resolved_id_col,
                "source_text": source_text,
                "hallucinated_quotes": sample_hallucinations
            })

        if sample_typos:
            typo_corrections.append({
                "sample_index": r.get("sample_index", idx),
                "sample_id": resolved_sample_id,
                "id_column": resolved_id_col,
                "source_text": source_text,
                "corrected_quotes": sample_typos
            })

        overlap_quotes = []
        for ps in pos_snippets:
            for ns in neg_snippets:
                if ps == ns or (len(ps) > 5 and ps in ns) or (len(ns) > 5 and ns in ps):
                    overlap_quotes.append({"quote": ps, "types": ["Positivo", "Negativo"]})
            for neu in neu_snippets:
                if ps == neu or (len(ps) > 5 and ps in neu) or (len(neu) > 5 and neu in ps):
                    overlap_quotes.append({"quote": ps, "types": ["Positivo", "Neutro"]})

        if overlap_quotes:
            disjoint_failures.append({
                "sample_index": r.get("sample_index", idx),
                "sample_id": resolved_sample_id,
                "id_column": resolved_id_col,
                "source_text": source_text,
                "overlapping_quotes": overlap_quotes
            })

    return {
        "experiment_id": experiment_id,
        "model_id": model_id,
        "id_column": exp.id_column,
        "total_samples": len(results),
        "verbatim_mode": verbatim_mode,
        "evaluated_fields": ["markers_positive", "markers_negative", "markers_neutral", "citas", "review_comment"],
        "verbatim_failures": verbatim_failures,
        "typo_corrections": typo_corrections,
        "disjointness_failures": disjoint_failures,
        "rule_failures": rule_failures
    }

@router.get("/{experiment_id}/audit/pairwise")
def audit_pairwise_discrepancies(
    experiment_id: str,
    model_a: str = Query(..., description="Primer modelo / juez"),
    model_b: str = Query(..., description="Segundo modelo / juez"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns exact row-by-row discrepancies between two raters/models:
    - Target fields evaluated
    - Agreement and disagreement counts
    - Detailed list of rows where raters disagreed with quotes and source text
    """
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=True)

    raw_results = exp.raw_results or {}
    results_a = raw_results.get(model_a, [])
    results_b = raw_results.get(model_b, [])

    if not results_a:
        for k in raw_results.keys():
            if model_a == k or model_a in k or k.endswith(model_a):
                results_a = raw_results[k]
                model_a = k
                break
    if not results_b:
        for k in raw_results.keys():
            if model_b == k or model_b in k or k.endswith(model_b):
                results_b = raw_results[k]
                model_b = k
                break

    min_len = min(len(results_a), len(results_b))
    from backend.app.metrics.engine import extract_aspect_items, resolve_source_text, is_verbatim_match

    def _build_typed_quotes(item: Dict[str, Any], src_text: str) -> List[Dict[str, Any]]:
        typed: List[Dict[str, Any]] = []
        seen: set = set()
        for field, pol_tag in [
            ("markers_positive", "positive"),
            ("markers_negative", "negative"),
            ("markers_neutral", "neutral"),
            ("citas", "neutral"),
        ]:
            for q in item.get(field, []) or []:
                qs = str(q).strip()
                if not qs or qs.lower() in ["blank", "none"] or qs.lower() in seen:
                    continue
                seen.add(qs.lower())
                typed.append({
                    "quote": qs,
                    "polarity": pol_tag,
                    "is_verbatim": bool(src_text and is_verbatim_match(qs, src_text, mode="tolerant")),
                })
        return typed

    def _build_assigned_fields(row_ctx: Dict[str, Any]) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
        if not row_ctx or not isinstance(row_ctx, dict):
            return [], []
        ctx_cols = list(dict.fromkeys([c for c in ((exp.input_columns or []) + (exp.context_columns or [])) if c]))
        spec_dict = exp.eval_spec if isinstance(exp.eval_spec, dict) else {}
        spec_cols = [c for c in (spec_dict.get("spec_columns") or []) if c]
        if not spec_cols:
            inferred: List[str] = []
            gt_col = spec_dict.get("ground_truth_col")
            if gt_col and isinstance(gt_col, str):
                inferred.append(gt_col.strip("{}"))
            for of in spec_dict.get("output_fields") or []:
                if isinstance(of, dict) and of.get("ground_truth_col"):
                    inferred.append(str(of["ground_truth_col"]).strip("{}"))
            for cs in spec_dict.get("computed_specs") or []:
                if isinstance(cs, dict):
                    for arg in cs.get("arguments") or []:
                        if isinstance(arg, str):
                            inferred.append(arg)
                    if cs.get("ground_truth_col"):
                        inferred.append(str(cs["ground_truth_col"]).strip("{}"))
            m_cfg = spec_dict.get("methodology_config") or {}
            if isinstance(m_cfg, dict):
                p4_col = (m_cfg.get("pilar_4") or {}).get("rating_col")
                if p4_col:
                    inferred.append(str(p4_col))
            for col in inferred:
                if col in row_ctx and col not in ctx_cols and col != exp.id_column and col not in spec_cols:
                    spec_cols.append(col)

        context_fields = [
            {"name": col, "value": "" if row_ctx.get(col) is None else str(row_ctx.get(col)), "role": "context"}
            for col in ctx_cols
            if col in row_ctx
        ]
        spec_fields = [
            {"name": col, "value": "" if row_ctx.get(col) is None else str(row_ctx.get(col)), "role": "spec"}
            for col in spec_cols
            if col in row_ctx and col not in ctx_cols and col != exp.id_column
        ]
        return context_fields, spec_fields

    discrepancies = []
    agreements_count = 0
    total_evals = 0
    evaluated_fields = set()
    labels_a: List[str] = []
    labels_b: List[str] = []
    dim_stats: Dict[str, Dict[str, int]] = {}
    from collections import Counter
    confusion_counts: Counter = Counter()

    for idx in range(min_len):
        ra = results_a[idx]
        rb = results_b[idx]
        pa = ra.get("parsed_json") or {}
        pb = rb.get("parsed_json") or {}
        row_ctx = ra.get("row_context") or rb.get("row_context") or {}
        source_text = resolve_source_text(row_ctx, exp.eval_spec, exp.input_columns)
        context_fields, spec_fields = _build_assigned_fields(row_ctx)
        resolved_id_col, resolved_sample_id = _resolve_sample_id(ra if ra.get("row_context") else rb, idx, exp.id_column)

        aspects_a = {item["dimension"].lower(): item for item in extract_aspect_items(pa)}
        aspects_b = {item["dimension"].lower(): item for item in extract_aspect_items(pb)}

        if aspects_a and aspects_b:
            all_dims = sorted(list(set(aspects_a.keys()) | set(aspects_b.keys())))
            sample_diffs = []
            for dk in all_dims:
                evaluated_fields.add(f"{dk}.sentiment")
                item_a = aspects_a.get(dk, {})
                item_b = aspects_b.get(dk, {})
                pol_a = str(item_a.get("polaridad") or item_a.get("sentiment") or "blank").lower()
                pol_b = str(item_b.get("polaridad") or item_b.get("sentiment") or "blank").lower()

                labels_a.append(pol_a)
                labels_b.append(pol_b)
                if dk not in dim_stats:
                    dim_stats[dk] = {"agreements": 0, "disagreements": 0, "total": 0}
                dim_stats[dk]["total"] += 1

                total_evals += 1
                if pol_a == pol_b:
                    agreements_count += 1
                    dim_stats[dk]["agreements"] += 1
                else:
                    dim_stats[dk]["disagreements"] += 1
                    confusion_counts[(pol_a, pol_b)] += 1
                    typed_a = _build_typed_quotes(item_a, source_text)
                    typed_b = _build_typed_quotes(item_b, source_text)
                    sample_diffs.append({
                        "dimension": dk,
                        "model_a_val": pol_a,
                        "model_b_val": pol_b,
                        "quotes_a": [t["quote"] for t in typed_a],
                        "quotes_b": [t["quote"] for t in typed_b],
                        "typed_quotes_a": typed_a,
                        "typed_quotes_b": typed_b,
                    })
            if sample_diffs:
                discrepancies.append({
                    "sample_index": ra.get("sample_index", idx),
                    "sample_id": resolved_sample_id,
                    "id_column": resolved_id_col,
                    "source_text": source_text,
                    "context_fields": context_fields,
                    "spec_fields": spec_fields,
                    "differences": sample_diffs
                })
        else:
            target_field = "resultado_calculo"
            va = pa.get(target_field) if target_field in pa else pa.get("polaridad_global")
            vb = pb.get(target_field) if target_field in pb else pb.get("polaridad_global")
            pol_a = str(va).lower() if va is not None else "blank"
            pol_b = str(vb).lower() if vb is not None else "blank"
            labels_a.append(pol_a)
            labels_b.append(pol_b)
            evaluated_fields.add(target_field)
            total_evals += 1
            if va == vb:
                agreements_count += 1
            else:
                confusion_counts[(pol_a, pol_b)] += 1
                discrepancies.append({
                    "sample_index": ra.get("sample_index", idx),
                    "sample_id": resolved_sample_id,
                    "id_column": resolved_id_col,
                    "source_text": source_text,
                    "context_fields": context_fields,
                    "spec_fields": spec_fields,
                    "differences": [{
                        "dimension": "global",
                        "model_a_val": str(va),
                        "model_b_val": str(vb),
                        "quotes_a": [],
                        "quotes_b": []
                    }]
                })

    n_labels = len(labels_a)
    po = (agreements_count / n_labels) if n_labels > 0 else 0.0
    categories = sorted(list(set(labels_a) | set(labels_b)))
    pe = 0.0
    if n_labels > 0:
        for cat in categories:
            pa_cat = sum(1 for a in labels_a if a == cat) / n_labels
            pb_cat = sum(1 for b in labels_b if b == cat) / n_labels
            pe += pa_cat * pb_cat
    kappa_val = 1.0 if (1.0 - pe) == 0 and po == 1.0 else (0.0 if (1.0 - pe) == 0 else round((po - pe) / (1.0 - pe), 4))

    do_val = (sum(1 for a, b in zip(labels_a, labels_b) if a != b) / n_labels) if n_labels > 0 else 0.0
    label_counts = Counter(labels_a + labels_b)
    total_2n = 2 * n_labels
    sum_nc_sq = sum(c ** 2 for c in label_counts.values())
    de_val = ((total_2n ** 2 - sum_nc_sq) / (total_2n * (total_2n - 1))) if total_2n > 1 else 0.0
    alpha_val = 1.0 if de_val == 0 and do_val == 0 else (0.0 if de_val == 0 else round(1.0 - (do_val / de_val), 4))

    return {
        "experiment_id": experiment_id,
        "model_a": model_a,
        "model_b": model_b,
        "id_column": exp.id_column,
        "evaluated_fields": sorted(list(evaluated_fields)),
        "total_compared": min_len,
        "total_aspect_evaluations": total_evals,
        "agreements_count": agreements_count,
        "disagreements_count": total_evals - agreements_count,
        "samples_with_discrepancy": len(discrepancies),
        "calculation_breakdown": {
            "po": round(po, 4),
            "pe": round(pe, 4),
            "kappa": kappa_val,
            "do": round(do_val, 4),
            "de": round(de_val, 4),
            "alpha": alpha_val,
            "raw_agreement_rate": round(po * 100.0, 1),
            "dimension_breakdown": [
                {
                    "dimension": dk,
                    "agreements": st["agreements"],
                    "disagreements": st["disagreements"],
                    "total": st["total"],
                    "agreement_pct": round((st["agreements"] / st["total"]) * 100.0, 1) if st["total"] > 0 else 0.0,
                }
                for dk, st in sorted(dim_stats.items())
            ],
            "top_confusions": [
                {"model_a_val": k[0], "model_b_val": k[1], "count": c}
                for k, c in confusion_counts.most_common(6)
            ],
        },
        "discrepancies": discrepancies
    }


class ExportModelsJsonRequest(BaseModel):
    model_ids: List[str]


@router.post("/{experiment_id}/export-json")
def export_experiment_models_json(
    experiment_id: str,
    req: ExportModelsJsonRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exp, _ = _get_accessible_experiment(experiment_id, current_user, db, require_edit=False)
    raw_results = exp.raw_results or {}
    if not req.model_ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos un modelo para exportar")

    resolved_items: List[Tuple[str, List[Dict[str, Any]]]] = []
    seen_keys = set()
    for req_id in req.model_ids:
        matched_key = None
        if req_id in raw_results:
            matched_key = req_id
        else:
            for k in raw_results.keys():
                if req_id == k or k.endswith(f"/{req_id}") or req_id in k:
                    matched_key = k
                    break
        if matched_key and matched_key not in seen_keys:
            seen_keys.add(matched_key)
            resolved_items.append((matched_key, raw_results.get(matched_key) or []))

    if not resolved_items:
        raise HTTPException(status_code=404, detail="No se encontraron resultados JSON para los modelos seleccionados")

    output_schema = None
    if exp.eval_spec and isinstance(exp.eval_spec, dict):
        schema_candidate = exp.eval_spec.get("output_schema")
        if isinstance(schema_candidate, dict) and len(schema_candidate) > 0:
            output_schema = schema_candidate

    def project_output_to_schema(raw_val: Any, schema: Optional[Dict[str, Any]]) -> Any:
        if not schema or not isinstance(raw_val, dict):
            return raw_val
        dim_source = raw_val.get("dimensions") if isinstance(raw_val.get("dimensions"), dict) else {}
        projected: Dict[str, Any] = {}
        for k, s_val in schema.items():
            found = None
            if k in raw_val:
                found = raw_val[k]
            else:
                for rk, rv in raw_val.items():
                    if rk.lower() == k.lower():
                        found = rv
                        break
            if found is None and dim_source:
                if k in dim_source:
                    found = dim_source[k]
                else:
                    for dk, dv in dim_source.items():
                        if dk.lower() == k.lower():
                            found = dv
                            break
            if isinstance(s_val, dict):
                projected[k] = project_output_to_schema(found if isinstance(found, dict) else {}, s_val)
            elif found is not None:
                projected[k] = found
            elif isinstance(s_val, list):
                projected[k] = []
            elif isinstance(s_val, bool):
                projected[k] = False
            elif isinstance(s_val, (int, float)):
                projected[k] = 0.0
            else:
                projected[k] = "blank" if k.lower() in ("sentiment", "polarity", "polaridad") else ""
        return projected

    def build_model_payload(model_key: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            "experiment_id": exp.id,
            "experiment_name": exp.name,
            "model_id": model_key,
            "dataset_id": exp.dataset_id,
            "total_samples": len(rows),
            "results": [
                {
                    "sample_id": _resolve_sample_id(r, idx, exp.id_column)[1],
                    "input": r.get("row_context") or {},
                    "output": project_output_to_schema(
                        r.get("parsed_json") if r.get("parsed_json") is not None else r.get("raw_output"),
                        output_schema,
                    ),
                    "specs": {
                        "latency_ms": r.get("latency_ms"),
                        "error": r.get("error"),
                    },
                }
                for idx, r in enumerate(rows)
            ],
        }

    def safe_slug(val: str) -> str:
        return re.sub(r"[^a-zA-Z0-9._-]+", "_", val).strip("_") or "model"

    if len(resolved_items) == 1:
        model_key, rows = resolved_items[0]
        payload = build_model_payload(model_key, rows)
        filename = f"{safe_slug(model_key.split('/')[-1])}.json"
        return Response(
            content=json.dumps(payload, ensure_ascii=False, indent=2),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    zip_buf = io.BytesIO()
    used_names: Dict[str, int] = {}
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for model_key, rows in resolved_items:
            payload = build_model_payload(model_key, rows)
            base_name = safe_slug(model_key.split("/")[-1])
            count = used_names.get(base_name, 0)
            used_names[base_name] = count + 1
            entry_name = f"{base_name}.json" if count == 0 else f"{base_name}_{count + 1}.json"
            zf.writestr(entry_name, json.dumps(payload, ensure_ascii=False, indent=2))

    zip_name = f"{safe_slug(exp.name or exp.id)}_models_json.zip"
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )
